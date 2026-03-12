----------------------------------------------------------------------
-- SitoDamageMeter - Data Tracking
-- Stores and calculates damage, healing, DPS, HPS per player
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Data structures
----------------------------------------------------------------------
-- players[GUID] = {
--     name       = "PlayerName",
--     class      = "WARRIOR",
--     guid       = "Player-1234-...",
--     damage     = 0,
--     healing    = 0,
--     overhealing = 0,
--     absorbed   = 0,     -- damage absorbed by shields
--     deaths     = 0,
--     combatTime = 0,     -- seconds in combat
--     combatStart = nil,  -- timestamp of current combat start
--     spells     = {},    -- spell breakdown
--     targets    = {},    -- target breakdown
--     pets       = {},    -- pet GUID set
-- }
--
-- spells[spellID] = {
--     name    = "Spell Name",
--     damage  = 0,
--     healing = 0,
--     hits    = 0,
--     crits   = 0,
--     misses  = 0,
--     min     = 999999999,
--     max     = 0,
--     school  = 1,
-- }

function SDM:InitData()
    self.players = {}
    self.activeFight = false
    self.fightStartTime = nil
    self.fightEndTime = nil
end

----------------------------------------------------------------------
-- Get or create player data
----------------------------------------------------------------------
function SDM:GetPlayerData(guid, name, flags)
    if not guid then return nil end

    if not self.players[guid] then
        -- Determine class
        local class = nil
        local _, engClass = GetPlayerInfoByGUID(guid)
        class = engClass

        self.players[guid] = {
            name        = name or "Unknown",
            class       = class,
            guid        = guid,
            damage      = 0,
            healing     = 0,
            overhealing = 0,
            absorbed    = 0,
            deaths      = 0,
            combatTime  = 0,
            combatStart = nil,
            spells      = {},
            targets     = {},
            pets        = {},
        }
    end

    -- Update name if we have a better one
    local data = self.players[guid]
    if name and name ~= "Unknown" then
        data.name = name
    end

    return data
end

----------------------------------------------------------------------
-- Get or create spell data within a player
----------------------------------------------------------------------
local function GetSpellData(playerData, spellID, spellName, spellSchool)
    if not spellID then spellID = 0 end
    if not playerData.spells[spellID] then
        playerData.spells[spellID] = {
            name    = spellName or "Auto Attack",
            damage  = 0,
            healing = 0,
            hits    = 0,
            crits   = 0,
            misses  = 0,
            min     = 999999999,
            max     = 0,
            school  = spellSchool or 1,
        }
    end
    return playerData.spells[spellID]
end

----------------------------------------------------------------------
-- Get or create target data within a player
----------------------------------------------------------------------
local function GetTargetData(playerData, targetName)
    if not targetName then targetName = "Unknown" end
    if not playerData.targets[targetName] then
        playerData.targets[targetName] = {
            damage  = 0,
            healing = 0,
        }
    end
    return playerData.targets[targetName]
end

----------------------------------------------------------------------
-- Handle damage events
----------------------------------------------------------------------
function SDM:HandleDamage(subevent, sourceGUID, sourceName, sourceFlags,
                          destGUID, destName, destFlags, ownerGUID, ...)
    -- Determine effective source (owner if pet)
    local effectiveGUID = ownerGUID or sourceGUID
    local effectiveName = sourceName

    if ownerGUID then
        -- Look up owner name
        local ownerData = self.players[ownerGUID]
        if ownerData then
            effectiveName = ownerData.name
        else
            local _, ownerClass = GetPlayerInfoByGUID(ownerGUID)
            effectiveName = self:GetNameFromGUID(ownerGUID) or sourceName
        end
    end

    local playerData = self:GetPlayerData(effectiveGUID, effectiveName, sourceFlags)
    if not playerData then return end

    -- Track pet association
    if ownerGUID and sourceGUID ~= ownerGUID then
        playerData.pets[sourceGUID] = sourceName or "Pet"
    end

    -- Parse the combat log args based on subevent type
    local timestamp, subev, hideCaster,
          sGUID, sName, sFlags, sRaidFlags,
          dGUID, dName, dFlags, dRaidFlags = ...

    local spellID, spellName, spellSchool
    local amount, overkill, school, resisted, blocked, absorbed, critical

    if subevent == "SWING_DAMAGE" then
        -- SWING_DAMAGE: ..., amount, overkill, school, resisted, blocked, absorbed, critical, glancing, crushing
        spellID = 0
        spellName = "Auto Attack"
        spellSchool = 1
        amount, overkill, school, resisted, blocked, absorbed, critical =
            select(12, ...)
    else
        -- SPELL_DAMAGE etc: ..., spellId, spellName, spellSchool, amount, overkill, school, resisted, blocked, absorbed, critical
        spellID, spellName, spellSchool = select(12, ...)
        amount, overkill, school, resisted, blocked, absorbed, critical =
            select(15, ...)
    end

    if not amount or type(amount) ~= "number" then return end

    -- Update totals
    playerData.damage = playerData.damage + amount

    -- Update spell breakdown
    local spell = GetSpellData(playerData, spellID, spellName, spellSchool)
    spell.damage = spell.damage + amount
    spell.hits = spell.hits + 1
    if critical then
        spell.crits = spell.crits + 1
    end
    if amount < spell.min then spell.min = amount end
    if amount > spell.max then spell.max = amount end

    -- Update target breakdown
    local target = GetTargetData(playerData, destName)
    target.damage = target.damage + amount

    -- Mark fight active
    self:MarkActivity()

    -- Update current segment
    if self.currentSegment then
        self.currentSegment.totalDamage = (self.currentSegment.totalDamage or 0) + amount
    end

    -- Flag for UI refresh
    self.dataDirty = true
end

----------------------------------------------------------------------
-- Handle healing events
----------------------------------------------------------------------
function SDM:HandleHealing(subevent, sourceGUID, sourceName, sourceFlags,
                           destGUID, destName, destFlags, ownerGUID, ...)
    local effectiveGUID = ownerGUID or sourceGUID
    local effectiveName = sourceName

    if ownerGUID then
        local ownerData = self.players[ownerGUID]
        if ownerData then
            effectiveName = ownerData.name
        else
            effectiveName = self:GetNameFromGUID(ownerGUID) or sourceName
        end
    end

    local playerData = self:GetPlayerData(effectiveGUID, effectiveName, sourceFlags)
    if not playerData then return end

    if ownerGUID and sourceGUID ~= ownerGUID then
        playerData.pets[sourceGUID] = sourceName or "Pet"
    end

    -- Parse: ..., spellId, spellName, spellSchool, amount, overhealing, absorbed, critical
    local spellID, spellName, spellSchool = select(12, ...)
    local amount, overhealing, absorbed, critical = select(15, ...)

    if not amount or type(amount) ~= "number" then return end

    -- Effective healing = amount - overhealing
    local effectiveHeal = amount - (overhealing or 0)
    if effectiveHeal < 0 then effectiveHeal = 0 end

    playerData.healing = playerData.healing + effectiveHeal
    playerData.overhealing = playerData.overhealing + (overhealing or 0)

    -- Spell breakdown
    local spell = GetSpellData(playerData, spellID, spellName, spellSchool)
    spell.healing = spell.healing + effectiveHeal
    spell.hits = spell.hits + 1
    if critical then
        spell.crits = spell.crits + 1
    end
    if effectiveHeal < spell.min then spell.min = effectiveHeal end
    if effectiveHeal > spell.max then spell.max = effectiveHeal end

    -- Target breakdown
    local target = GetTargetData(playerData, destName)
    target.healing = target.healing + effectiveHeal

    self:MarkActivity()

    if self.currentSegment then
        self.currentSegment.totalHealing = (self.currentSegment.totalHealing or 0) + effectiveHeal
    end

    self.dataDirty = true
end

----------------------------------------------------------------------
-- Handle miss events
----------------------------------------------------------------------
function SDM:HandleMiss(subevent, sourceGUID, sourceName, sourceFlags, ownerGUID, ...)
    local effectiveGUID = ownerGUID or sourceGUID
    local effectiveName = sourceName

    if ownerGUID then
        local ownerData = self.players[ownerGUID]
        if ownerData then effectiveName = ownerData.name end
    end

    local playerData = self:GetPlayerData(effectiveGUID, effectiveName, sourceFlags)
    if not playerData then return end

    local spellID, spellName, spellSchool
    if subevent == "SWING_MISSED" then
        spellID = 0
        spellName = "Auto Attack"
        spellSchool = 1
    else
        spellID, spellName, spellSchool = select(12, ...)
    end

    local spell = GetSpellData(playerData, spellID, spellName, spellSchool)
    spell.misses = spell.misses + 1
end

----------------------------------------------------------------------
-- Handle death events
----------------------------------------------------------------------
function SDM:HandleDeath(destGUID, destName, destFlags)
    if not self:IsGroupUnit(destFlags) then return end
    if not self:IsPlayer(destFlags) then return end

    local playerData = self.players[destGUID]
    if playerData then
        playerData.deaths = playerData.deaths + 1
    end

    if self.currentSegment then
        self.currentSegment.deaths = (self.currentSegment.deaths or 0) + 1
    end

    self.dataDirty = true
end

----------------------------------------------------------------------
-- Combat time tracking
----------------------------------------------------------------------
function SDM:MarkActivity()
    local now = GetTime()
    if not self.activeFight then
        self.activeFight = true
        self.fightStartTime = now
    end
    -- Mark all active players as in combat
    for guid, data in pairs(self.players) do
        if not data.combatStart then
            data.combatStart = now
        end
    end
end

function SDM:OnCombatStart()
    self:MarkActivity()
end

function SDM:OnCombatEnd()
    -- Don't end immediately - wait for segment management
    -- Combat time is tracked per-player on segment end
end

----------------------------------------------------------------------
-- Finalize combat times when a segment ends
----------------------------------------------------------------------
function SDM:FinalizeCombatTimes()
    local now = GetTime()
    for guid, data in pairs(self.players) do
        if data.combatStart then
            data.combatTime = data.combatTime + (now - data.combatStart)
            data.combatStart = nil
        end
    end
    self.activeFight = false
end

----------------------------------------------------------------------
-- Get fight duration
----------------------------------------------------------------------
function SDM:GetFightDuration()
    if not self.fightStartTime then return 0 end
    local endTime = self.fightEndTime or GetTime()
    return endTime - self.fightStartTime
end

----------------------------------------------------------------------
-- Get DPS/HPS for a player
----------------------------------------------------------------------
function SDM:GetPlayerDPS(playerData)
    if not playerData then return 0 end
    local duration = self:GetFightDuration()
    if duration <= 0 then return 0 end
    return playerData.damage / duration
end

function SDM:GetPlayerHPS(playerData)
    if not playerData then return 0 end
    local duration = self:GetFightDuration()
    if duration <= 0 then return 0 end
    return playerData.healing / duration
end

----------------------------------------------------------------------
-- Get sorted data for display
----------------------------------------------------------------------
function SDM:GetSortedData(viewMode)
    local sorted = {}
    for guid, data in pairs(self.players) do
        local value = 0
        if viewMode == "damage" then
            value = data.damage
        elseif viewMode == "healing" then
            value = data.healing
        elseif viewMode == "dps" then
            value = self:GetPlayerDPS(data)
        elseif viewMode == "hps" then
            value = self:GetPlayerHPS(data)
        end

        if value > 0 then
            table.insert(sorted, {
                guid    = guid,
                name    = data.name,
                class   = data.class,
                value   = value,
                damage  = data.damage,
                healing = data.healing,
                deaths  = data.deaths,
                dps     = self:GetPlayerDPS(data),
                hps     = self:GetPlayerHPS(data),
            })
        end
    end

    table.sort(sorted, function(a, b) return a.value > b.value end)
    return sorted
end

----------------------------------------------------------------------
-- Get total for current view
----------------------------------------------------------------------
function SDM:GetTotal(viewMode)
    local total = 0
    for _, data in pairs(self.players) do
        if viewMode == "damage" then
            total = total + data.damage
        elseif viewMode == "healing" then
            total = total + data.healing
        elseif viewMode == "dps" then
            total = total + self:GetPlayerDPS(data)
        elseif viewMode == "hps" then
            total = total + self:GetPlayerHPS(data)
        end
    end
    return total
end

----------------------------------------------------------------------
-- Get name from GUID (helper)
----------------------------------------------------------------------
function SDM:GetNameFromGUID(guid)
    if not guid then return nil end
    -- Try the data table first
    if self.players[guid] then
        return self.players[guid].name
    end
    -- Use API
    local _, _, _, _, _, name = GetPlayerInfoByGUID(guid)
    return name
end

----------------------------------------------------------------------
-- Reset all data
----------------------------------------------------------------------
function SDM:ResetData()
    self.players = {}
    self.activeFight = false
    self.fightStartTime = nil
    self.fightEndTime = nil
    self.dataDirty = true
    self:ResetSegments()
    if self.UpdateBars then
        self:UpdateBars()
    end
    print("|cff00ccffSito Damage Meter|r: Data reset.")
end
