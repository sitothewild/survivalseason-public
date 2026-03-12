----------------------------------------------------------------------
-- SitoDamageMeter - Core
-- Global namespace, event dispatcher, and combat log parser
----------------------------------------------------------------------

-- Addon namespace shared across all files
local ADDON_NAME, SDM = ...

-- Expose namespace globally for saved variables callback
SitoDamageMeter = SDM

-- Version
SDM.VERSION = "1.0.0"

----------------------------------------------------------------------
-- Default saved variables
----------------------------------------------------------------------
SDM.DEFAULTS = {
    showOnLogin     = true,
    locked          = false,
    barHeight       = 18,
    barSpacing      = 1,
    maxBars         = 20,
    barTexture      = "Interface\\TargetingFrame\\UI-StatusBar",
    frameWidth      = 260,
    frameHeight     = 200,
    framePoint      = { "RIGHT", nil, "RIGHT", -20, 0 },
    classColors     = true,
    showRank        = true,
    showPercent     = true,
    currentView     = "damage",   -- "damage", "healing", "dps", "hps"
    minimap         = { hide = false },
}

----------------------------------------------------------------------
-- Class color table (fallback if RAID_CLASS_COLORS unavailable)
----------------------------------------------------------------------
SDM.CLASS_COLORS = {
    WARRIOR     = { r = 0.78, g = 0.61, b = 0.43 },
    PALADIN     = { r = 0.96, g = 0.55, b = 0.73 },
    HUNTER      = { r = 0.67, g = 0.83, b = 0.45 },
    ROGUE       = { r = 1.00, g = 0.96, b = 0.41 },
    PRIEST      = { r = 1.00, g = 1.00, b = 1.00 },
    DEATHKNIGHT = { r = 0.77, g = 0.12, b = 0.23 },
    SHAMAN      = { r = 0.00, g = 0.44, b = 0.87 },
    MAGE        = { r = 0.25, g = 0.78, b = 0.92 },
    WARLOCK     = { r = 0.53, g = 0.53, b = 0.93 },
    MONK        = { r = 0.00, g = 1.00, b = 0.60 },
    DRUID       = { r = 1.00, g = 0.49, b = 0.04 },
    DEMONHUNTER = { r = 0.64, g = 0.19, b = 0.79 },
    EVOKER      = { r = 0.20, g = 0.58, b = 0.50 },
}

----------------------------------------------------------------------
-- Utility: Get class color for a unit
----------------------------------------------------------------------
function SDM:GetClassColor(class)
    if not class then return 0.5, 0.5, 0.5 end
    local c = RAID_CLASS_COLORS and RAID_CLASS_COLORS[class] or self.CLASS_COLORS[class]
    if c then
        return c.r, c.g, c.b
    end
    return 0.5, 0.5, 0.5
end

----------------------------------------------------------------------
-- Utility: Format large numbers (1234567 -> "1.23M")
----------------------------------------------------------------------
function SDM:FormatNumber(n)
    if not n then return "0" end
    if n >= 1e9 then
        return string.format("%.2fB", n / 1e9)
    elseif n >= 1e6 then
        return string.format("%.2fM", n / 1e6)
    elseif n >= 1e3 then
        return string.format("%.1fK", n / 1e3)
    end
    return tostring(math.floor(n))
end

----------------------------------------------------------------------
-- Utility: Format time (seconds -> "1m 23s")
----------------------------------------------------------------------
function SDM:FormatTime(sec)
    if not sec or sec <= 0 then return "0s" end
    local m = math.floor(sec / 60)
    local s = math.floor(sec % 60)
    if m > 0 then
        return string.format("%dm %02ds", m, s)
    end
    return string.format("%ds", s)
end

----------------------------------------------------------------------
-- Bitflag helpers for source/dest flags
----------------------------------------------------------------------
local COMBATLOG_OBJECT_AFFILIATION_MINE    = COMBATLOG_OBJECT_AFFILIATION_MINE    or 0x00000001
local COMBATLOG_OBJECT_AFFILIATION_PARTY   = COMBATLOG_OBJECT_AFFILIATION_PARTY   or 0x00000002
local COMBATLOG_OBJECT_AFFILIATION_RAID    = COMBATLOG_OBJECT_AFFILIATION_RAID    or 0x00000004
local COMBATLOG_OBJECT_REACTION_FRIENDLY   = COMBATLOG_OBJECT_REACTION_FRIENDLY   or 0x00000010
local COMBATLOG_OBJECT_TYPE_PLAYER         = COMBATLOG_OBJECT_TYPE_PLAYER         or 0x00000400
local COMBATLOG_OBJECT_TYPE_PET            = COMBATLOG_OBJECT_TYPE_PET            or 0x00001000
local COMBATLOG_OBJECT_TYPE_GUARDIAN       = COMBATLOG_OBJECT_TYPE_GUARDIAN        or 0x00002000

local GROUP_AFFILIATION = bit.bor(
    COMBATLOG_OBJECT_AFFILIATION_MINE,
    COMBATLOG_OBJECT_AFFILIATION_PARTY,
    COMBATLOG_OBJECT_AFFILIATION_RAID
)

function SDM:IsGroupUnit(flags)
    if not flags then return false end
    local isGroupAffil = bit.band(flags, GROUP_AFFILIATION) > 0
    local isFriendly   = bit.band(flags, COMBATLOG_OBJECT_REACTION_FRIENDLY) > 0
    local isPlayer     = bit.band(flags, COMBATLOG_OBJECT_TYPE_PLAYER) > 0
    local isPet        = bit.band(flags, COMBATLOG_OBJECT_TYPE_PET) > 0
    local isGuardian   = bit.band(flags, COMBATLOG_OBJECT_TYPE_GUARDIAN) > 0
    return isGroupAffil and isFriendly and (isPlayer or isPet or isGuardian)
end

function SDM:IsPlayer(flags)
    if not flags then return false end
    return bit.band(flags, COMBATLOG_OBJECT_TYPE_PLAYER) > 0
end

function SDM:IsPet(flags)
    if not flags then return false end
    return bit.band(flags, COMBATLOG_OBJECT_TYPE_PET) > 0
        or bit.band(flags, COMBATLOG_OBJECT_TYPE_GUARDIAN) > 0
end

----------------------------------------------------------------------
-- Pet -> Owner resolution
----------------------------------------------------------------------
SDM.petOwners = {}

function SDM:ResolvePetOwner(petGUID, petName, petFlags)
    if not self:IsPet(petFlags) then return nil end
    -- Check cached mapping
    if self.petOwners[petGUID] then
        return self.petOwners[petGUID]
    end
    -- Try tooltip scanning for owner
    local ownerGUID = C_PetInfo and C_PetInfo.GetPetOwner and C_PetInfo.GetPetOwner(petGUID)
    if ownerGUID then
        self.petOwners[petGUID] = ownerGUID
        return ownerGUID
    end
    -- Group scan fallback
    local prefix, count
    if IsInRaid() then
        prefix, count = "raid", GetNumGroupMembers()
    elseif IsInGroup() then
        prefix, count = "party", GetNumGroupMembers() - 1
    end
    if prefix then
        for i = 1, count do
            local unit = prefix .. i
            local pUnit = unit .. "pet"
            if UnitExists(pUnit) and UnitGUID(pUnit) == petGUID then
                local owGUID = UnitGUID(unit)
                self.petOwners[petGUID] = owGUID
                return owGUID
            end
        end
    end
    -- Check player pet
    if UnitExists("pet") and UnitGUID("pet") == petGUID then
        local owGUID = UnitGUID("player")
        self.petOwners[petGUID] = owGUID
        return owGUID
    end
    return nil
end

----------------------------------------------------------------------
-- Main event frame
----------------------------------------------------------------------
SDM.eventFrame = CreateFrame("Frame")
SDM.eventFrame:RegisterEvent("ADDON_LOADED")
SDM.eventFrame:RegisterEvent("PLAYER_LOGIN")
SDM.eventFrame:RegisterEvent("COMBAT_LOG_EVENT_UNFILTERED")
SDM.eventFrame:RegisterEvent("ENCOUNTER_START")
SDM.eventFrame:RegisterEvent("ENCOUNTER_END")
SDM.eventFrame:RegisterEvent("PLAYER_REGEN_DISABLED")
SDM.eventFrame:RegisterEvent("PLAYER_REGEN_ENABLED")
SDM.eventFrame:RegisterEvent("GROUP_ROSTER_UPDATE")
SDM.eventFrame:RegisterEvent("UNIT_PET")
SDM.eventFrame:RegisterEvent("PLAYER_ENTERING_WORLD")
SDM.eventFrame:RegisterEvent("ZONE_CHANGED_NEW_AREA")

SDM.eventFrame:SetScript("OnEvent", function(self, event, ...)
    if event == "ADDON_LOADED" then
        local addonName = ...
        if addonName == ADDON_NAME then
            SDM:OnAddonLoaded()
        end
    elseif event == "PLAYER_LOGIN" then
        SDM:OnPlayerLogin()
    elseif event == "COMBAT_LOG_EVENT_UNFILTERED" then
        SDM:OnCombatLogEvent(CombatLogGetCurrentEventInfo())
    elseif event == "ENCOUNTER_START" then
        SDM:OnEncounterStart(...)
    elseif event == "ENCOUNTER_END" then
        SDM:OnEncounterEnd(...)
    elseif event == "PLAYER_REGEN_DISABLED" then
        SDM:OnCombatStart()
    elseif event == "PLAYER_REGEN_ENABLED" then
        SDM:OnCombatEnd()
    elseif event == "GROUP_ROSTER_UPDATE" or event == "UNIT_PET" then
        SDM:ScanPets()
    elseif event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then
        SDM:ScanPets()
    end
end)

----------------------------------------------------------------------
-- Initialization
----------------------------------------------------------------------
function SDM:OnAddonLoaded()
    -- Initialize saved variables with defaults
    if not SitoDamageMeterDB then
        SitoDamageMeterDB = {}
    end
    for k, v in pairs(self.DEFAULTS) do
        if SitoDamageMeterDB[k] == nil then
            if type(v) == "table" then
                SitoDamageMeterDB[k] = CopyTable(v)
            else
                SitoDamageMeterDB[k] = v
            end
        end
    end
    self.db = SitoDamageMeterDB
end

function SDM:OnPlayerLogin()
    self:InitData()
    self:InitSegments()
    self:InitUI()
    self:RegisterSlashCommands()
    self:ScanPets()
    print("|cff00ccffSito Damage Meter|r v" .. self.VERSION .. " loaded. Type |cff00ccff/sdm|r for options.")
end

----------------------------------------------------------------------
-- Pet scanning
----------------------------------------------------------------------
function SDM:ScanPets()
    -- Player pet
    if UnitExists("pet") then
        local petGUID = UnitGUID("pet")
        local ownerGUID = UnitGUID("player")
        if petGUID and ownerGUID then
            self.petOwners[petGUID] = ownerGUID
        end
    end
    -- Group pets
    local prefix, count
    if IsInRaid() then
        prefix, count = "raid", GetNumGroupMembers()
    elseif IsInGroup() then
        prefix, count = "party", GetNumGroupMembers() - 1
    else
        return
    end
    if prefix then
        for i = 1, count do
            local pUnit = prefix .. i .. "pet"
            if UnitExists(pUnit) then
                local petGUID = UnitGUID(pUnit)
                local ownerGUID = UnitGUID(prefix .. i)
                if petGUID and ownerGUID then
                    self.petOwners[petGUID] = ownerGUID
                end
            end
        end
    end
end

----------------------------------------------------------------------
-- Combat log event dispatcher
----------------------------------------------------------------------
-- Damage events
local DAMAGE_EVENTS = {
    SWING_DAMAGE          = true,
    RANGE_DAMAGE          = true,
    SPELL_DAMAGE          = true,
    SPELL_PERIODIC_DAMAGE = true,
    DAMAGE_SHIELD          = true,
    DAMAGE_SPLIT           = true,
    SPELL_BUILDING_DAMAGE  = true,
}

-- Healing events
local HEAL_EVENTS = {
    SPELL_HEAL          = true,
    SPELL_PERIODIC_HEAL = true,
}

-- Miss events (for tracking)
local MISS_EVENTS = {
    SWING_MISSED  = true,
    RANGE_MISSED  = true,
    SPELL_MISSED  = true,
}

-- Death events
local DEATH_EVENTS = {
    UNIT_DIED     = true,
    UNIT_DESTROYED = true,
}

-- Aura events (for buff/debuff tracking)
local AURA_EVENTS = {
    SPELL_AURA_APPLIED     = true,
    SPELL_AURA_REMOVED     = true,
    SPELL_AURA_REFRESH     = true,
}

-- Summon events for pet tracking
local SUMMON_EVENTS = {
    SPELL_SUMMON = true,
}

function SDM:OnCombatLogEvent(...)
    local timestamp, subevent, hideCaster,
          sourceGUID, sourceName, sourceFlags, sourceRaidFlags,
          destGUID, destName, destFlags, destRaidFlags = ...

    -- Only track group members (and their pets)
    if not self:IsGroupUnit(sourceFlags) then return end

    -- Pet -> Owner resolution
    local ownerGUID
    if self:IsPet(sourceFlags) then
        ownerGUID = self:ResolvePetOwner(sourceGUID, sourceName, sourceFlags)
        if not ownerGUID then return end -- Skip unresolved pets
    end

    -- Handle summon events (map pet to owner)
    if SUMMON_EVENTS[subevent] then
        if destGUID and sourceGUID then
            self.petOwners[destGUID] = sourceGUID
        end
        return
    end

    -- Route to appropriate handler
    if DAMAGE_EVENTS[subevent] then
        self:HandleDamage(subevent, sourceGUID, sourceName, sourceFlags,
                          destGUID, destName, destFlags, ownerGUID, ...)
    elseif HEAL_EVENTS[subevent] then
        self:HandleHealing(subevent, sourceGUID, sourceName, sourceFlags,
                           destGUID, destName, destFlags, ownerGUID, ...)
    elseif MISS_EVENTS[subevent] then
        self:HandleMiss(subevent, sourceGUID, sourceName, sourceFlags, ownerGUID, ...)
    elseif DEATH_EVENTS[subevent] then
        self:HandleDeath(destGUID, destName, destFlags)
    end
end
