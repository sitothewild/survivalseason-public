----------------------------------------------------------------------
-- SitoDamageMeter - Segment/Encounter Management
-- Tracks individual fights, boss encounters, and overall data
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Segment structure:
-- {
--     name         = "Segment Name",
--     startTime    = <GetTime()>,
--     endTime      = nil or <GetTime()>,
--     duration     = 0,
--     totalDamage  = 0,
--     totalHealing = 0,
--     deaths       = 0,
--     players      = {}, -- deep copy of player data at segment end
--     isBoss       = false,
--     encounterID  = nil,
--     success      = nil,
-- }
----------------------------------------------------------------------

local MAX_SEGMENTS = 15

function SDM:InitSegments()
    self.segments = {}
    self.currentSegment = nil
    self.selectedSegmentIndex = 0  -- 0 = current/live data
    self.segmentTimer = nil
    self.combatEndTimer = nil
end

----------------------------------------------------------------------
-- Start a new segment
----------------------------------------------------------------------
function SDM:StartSegment(name, isBoss, encounterID)
    -- Finalize any existing segment first
    if self.currentSegment then
        self:EndSegment()
    end

    -- Reset live data for the new fight
    self.players = {}
    self.activeFight = true
    self.fightStartTime = GetTime()
    self.fightEndTime = nil

    self.currentSegment = {
        name         = name or "Combat",
        startTime    = GetTime(),
        endTime      = nil,
        duration     = 0,
        totalDamage  = 0,
        totalHealing = 0,
        deaths       = 0,
        players      = nil,
        isBoss       = isBoss or false,
        encounterID  = encounterID,
        success      = nil,
    }

    self.dataDirty = true
end

----------------------------------------------------------------------
-- End the current segment and archive it
----------------------------------------------------------------------
function SDM:EndSegment(success)
    if not self.currentSegment then return end

    local seg = self.currentSegment
    seg.endTime = GetTime()
    seg.duration = seg.endTime - seg.startTime

    -- Skip very short segments (< 3 seconds)
    if seg.duration < 3 then
        self.currentSegment = nil
        return
    end

    -- Finalize combat times
    self:FinalizeCombatTimes()

    -- Store fight end time
    self.fightEndTime = GetTime()

    -- Record success for boss fights
    if success ~= nil then
        seg.success = success
    end

    -- Deep copy player data into the segment
    seg.players = self:DeepCopyPlayers()

    -- Update segment name with damage total
    if seg.totalDamage and seg.totalDamage > 0 then
        seg.name = seg.name .. " (" .. self:FormatTime(seg.duration) .. ")"
    end

    -- Insert at front of list (most recent first)
    table.insert(self.segments, 1, seg)

    -- Trim old segments
    while #self.segments > MAX_SEGMENTS do
        table.remove(self.segments)
    end

    self.currentSegment = nil
    self.dataDirty = true
end

----------------------------------------------------------------------
-- Deep copy player data for archiving
----------------------------------------------------------------------
function SDM:DeepCopyPlayers()
    local copy = {}
    for guid, data in pairs(self.players) do
        copy[guid] = {
            name        = data.name,
            class       = data.class,
            guid        = data.guid,
            damage      = data.damage,
            healing     = data.healing,
            overhealing = data.overhealing,
            absorbed    = data.absorbed,
            deaths      = data.deaths,
            combatTime  = data.combatTime,
            spells      = {},
            targets     = {},
            pets        = {},
        }
        -- Copy spells
        for spellID, spell in pairs(data.spells) do
            copy[guid].spells[spellID] = {
                name    = spell.name,
                damage  = spell.damage,
                healing = spell.healing,
                hits    = spell.hits,
                crits   = spell.crits,
                misses  = spell.misses,
                min     = spell.min,
                max     = spell.max,
                school  = spell.school,
            }
        end
        -- Copy targets
        for targetName, target in pairs(data.targets) do
            copy[guid].targets[targetName] = {
                damage  = target.damage,
                healing = target.healing,
            }
        end
        -- Copy pets
        for petGUID, petName in pairs(data.pets) do
            copy[guid].pets[petGUID] = petName
        end
    end
    return copy
end

----------------------------------------------------------------------
-- Encounter events (boss fights)
----------------------------------------------------------------------
function SDM:OnEncounterStart(encounterID, encounterName, difficultyID, groupSize)
    self:StartSegment(encounterName or "Boss", true, encounterID)
end

function SDM:OnEncounterEnd(encounterID, encounterName, difficultyID, groupSize, success)
    if self.currentSegment then
        self.currentSegment.name = encounterName or self.currentSegment.name
        self:EndSegment(success == 1)
    end
end

----------------------------------------------------------------------
-- Non-boss combat management (trash)
-- Use a timer to batch short combats together
----------------------------------------------------------------------
local COMBAT_IDLE_TIMEOUT = 4  -- seconds of no combat before ending segment

function SDM:OnCombatStart()
    -- Cancel any pending end-of-combat timer
    if self.combatEndTimer then
        self.combatEndTimer:Cancel()
        self.combatEndTimer = nil
    end

    -- Start a new trash segment if we don't have one
    if not self.currentSegment then
        local zoneName = GetZoneText() or "Combat"
        self:StartSegment(zoneName .. " - Trash", false, nil)
    end
end

-- Override the core OnCombatEnd (called from PLAYER_REGEN_ENABLED)
function SDM:OnCombatEnd()
    -- Don't end boss segments on regen enabled (wait for ENCOUNTER_END)
    if self.currentSegment and self.currentSegment.isBoss then
        return
    end

    -- Start an idle timer - if no new combat within timeout, end segment
    if self.combatEndTimer then
        self.combatEndTimer:Cancel()
    end
    self.combatEndTimer = C_Timer.NewTimer(COMBAT_IDLE_TIMEOUT, function()
        if self.currentSegment and not self.currentSegment.isBoss then
            self:EndSegment()
        end
        self.combatEndTimer = nil
    end)
end

----------------------------------------------------------------------
-- Get data for display (current or selected segment)
----------------------------------------------------------------------
function SDM:GetDisplayPlayers()
    if self.selectedSegmentIndex == 0 then
        return self.players
    end
    local seg = self.segments[self.selectedSegmentIndex]
    if seg and seg.players then
        return seg.players
    end
    return self.players
end

function SDM:GetDisplayDuration()
    if self.selectedSegmentIndex == 0 then
        return self:GetFightDuration()
    end
    local seg = self.segments[self.selectedSegmentIndex]
    if seg then
        return seg.duration or 0
    end
    return 0
end

function SDM:GetDisplayName()
    if self.selectedSegmentIndex == 0 then
        if self.currentSegment then
            return self.currentSegment.name
        end
        return "Current"
    end
    local seg = self.segments[self.selectedSegmentIndex]
    if seg then
        return seg.name
    end
    return "Unknown"
end

----------------------------------------------------------------------
-- Select a segment for viewing
----------------------------------------------------------------------
function SDM:SelectSegment(index)
    self.selectedSegmentIndex = index or 0
    self.dataDirty = true
    if self.UpdateBars then
        self:UpdateBars()
    end
end

----------------------------------------------------------------------
-- Reset segments
----------------------------------------------------------------------
function SDM:ResetSegments()
    self.segments = {}
    self.currentSegment = nil
    self.selectedSegmentIndex = 0
end
