----------------------------------------------------------------------
-- SitoDamageMeter - Bar Display
-- Creates and updates the damage/healing bars
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Bar pool (recycled frames)
----------------------------------------------------------------------
local barPool = {}
local activeBars = {}

----------------------------------------------------------------------
-- School colors for spell breakdown
----------------------------------------------------------------------
local SCHOOL_COLORS = {
    [1]  = { 1.00, 1.00, 0.00 },  -- Physical
    [2]  = { 1.00, 0.90, 0.50 },  -- Holy
    [4]  = { 1.00, 0.50, 0.00 },  -- Fire
    [8]  = { 0.30, 1.00, 0.30 },  -- Nature
    [16] = { 0.50, 0.50, 1.00 },  -- Frost
    [32] = { 0.50, 0.00, 0.50 },  -- Shadow
    [64] = { 1.00, 0.50, 1.00 },  -- Arcane
}

----------------------------------------------------------------------
-- Create a bar frame
----------------------------------------------------------------------
local function CreateBar(parent, index)
    local bar = CreateFrame("Button", nil, parent)
    bar:SetHeight(SDM.db.barHeight)

    -- Status bar (background fill)
    local statusBar = CreateFrame("StatusBar", nil, bar)
    statusBar:SetAllPoints()
    statusBar:SetStatusBarTexture(SDM.db.barTexture)
    statusBar:SetMinMaxValues(0, 1)
    statusBar:SetValue(0)
    bar.statusBar = statusBar

    -- Dark background behind the bar
    local bg = bar:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0.1, 0.1, 0.1, 0.6)
    bar.bg = bg

    -- Rank number (left)
    local rank = statusBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    rank:SetPoint("LEFT", statusBar, "LEFT", 3, 0)
    rank:SetJustifyH("LEFT")
    rank:SetTextColor(0.8, 0.8, 0.8)
    bar.rank = rank

    -- Player name
    local nameText = statusBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    nameText:SetPoint("LEFT", rank, "RIGHT", 3, 0)
    nameText:SetPoint("RIGHT", statusBar, "RIGHT", -80, 0)
    nameText:SetJustifyH("LEFT")
    nameText:SetWordWrap(false)
    bar.nameText = nameText

    -- Value text (right side)
    local valueText = statusBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    valueText:SetPoint("RIGHT", statusBar, "RIGHT", -3, 0)
    valueText:SetJustifyH("RIGHT")
    bar.valueText = valueText

    -- Click handlers
    bar:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    bar:SetScript("OnClick", function(self, button)
        if button == "LeftButton" then
            -- Show detail breakdown
            if self.playerGUID then
                SDM:ShowPlayerDetail(self.playerGUID)
            end
        elseif button == "RightButton" then
            SDM:ShowContextMenu()
        end
    end)

    -- Tooltip
    bar:SetScript("OnEnter", function(self)
        if self.playerGUID then
            SDM:ShowBarTooltip(self)
        end
    end)
    bar:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)

    return bar
end

----------------------------------------------------------------------
-- Get a bar from pool or create new
----------------------------------------------------------------------
local function AcquireBar(parent, index)
    local bar = table.remove(barPool)
    if not bar then
        bar = CreateBar(parent, index)
    end
    bar:SetParent(parent)
    bar:Show()
    return bar
end

local function ReleaseBar(bar)
    bar:Hide()
    bar:ClearAllPoints()
    bar.playerGUID = nil
    table.insert(barPool, bar)
end

----------------------------------------------------------------------
-- Update all bars
----------------------------------------------------------------------
function SDM:UpdateBars()
    if not self.barContainer then return end

    -- Release old bars
    for _, bar in ipairs(activeBars) do
        ReleaseBar(bar)
    end
    wipe(activeBars)

    -- Get sorted data based on selected segment
    local viewMode = self.db.currentView
    local players = self:GetDisplayPlayers()

    -- Build sorted data from the display players
    local sorted = {}
    local duration = self:GetDisplayDuration()

    for guid, data in pairs(players) do
        local value = 0
        if viewMode == "damage" then
            value = data.damage
        elseif viewMode == "healing" then
            value = data.healing
        elseif viewMode == "dps" then
            value = duration > 0 and (data.damage / duration) or 0
        elseif viewMode == "hps" then
            value = duration > 0 and (data.healing / duration) or 0
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
                dps     = duration > 0 and (data.damage / duration) or 0,
                hps     = duration > 0 and (data.healing / duration) or 0,
            })
        end
    end

    table.sort(sorted, function(a, b) return a.value > b.value end)

    -- Calculate total and max value
    local maxValue = sorted[1] and sorted[1].value or 0
    local total = 0
    for _, d in ipairs(sorted) do total = total + d.value end

    -- Apply scroll offset
    local barHeight = self.db.barHeight
    local barSpacing = self.db.barSpacing
    local containerHeight = self.barContainer:GetHeight()
    local containerWidth = self.barContainer:GetWidth()
    local maxVisible = math.floor(containerHeight / (barHeight + barSpacing))
    local maxScroll = math.max(0, #sorted - maxVisible)

    if self.scrollOffset > maxScroll then
        self.scrollOffset = maxScroll
    end

    -- Create bars
    for i = 1, math.min(maxVisible, #sorted) do
        local dataIndex = i + self.scrollOffset
        local d = sorted[dataIndex]
        if not d then break end

        local bar = AcquireBar(self.barContainer, i)
        bar:SetHeight(barHeight)
        bar:SetPoint("TOPLEFT", self.barContainer, "TOPLEFT", 0, -((i - 1) * (barHeight + barSpacing)))
        bar:SetPoint("TOPRIGHT", self.barContainer, "TOPRIGHT", 0, -((i - 1) * (barHeight + barSpacing)))

        bar.playerGUID = d.guid

        -- Color by class
        local r, g, b = self:GetClassColor(d.class)
        bar.statusBar:SetStatusBarColor(r, g, b, 0.8)

        -- Fill percentage (relative to top player)
        local fillPct = maxValue > 0 and (d.value / maxValue) or 0
        bar.statusBar:SetValue(fillPct)

        -- Rank
        if self.db.showRank then
            bar.rank:SetText(dataIndex .. ".")
            bar.rank:Show()
        else
            bar.rank:Hide()
        end

        -- Name
        bar.nameText:SetText(d.name)
        bar.nameText:SetTextColor(r, g, b)

        -- Value text with percentage
        local valueStr = self:FormatNumber(d.value)
        if self.db.showPercent and total > 0 then
            local pct = (d.value / total) * 100
            valueStr = valueStr .. string.format(" (%.1f%%)", pct)
        end
        bar.valueText:SetText(valueStr)
        bar.valueText:SetTextColor(1, 1, 1, 0.9)

        table.insert(activeBars, bar)
    end

    -- Update title and segment text
    self:UpdateTitleText()
    self:UpdateSegmentText()
end

----------------------------------------------------------------------
-- Bar tooltip
----------------------------------------------------------------------
function SDM:ShowBarTooltip(bar)
    local guid = bar.playerGUID
    local players = self:GetDisplayPlayers()
    local data = players[guid]
    if not data then return end

    local duration = self:GetDisplayDuration()

    GameTooltip:SetOwner(bar, "ANCHOR_LEFT")
    GameTooltip:ClearLines()

    -- Player name header
    local r, g, b = self:GetClassColor(data.class)
    GameTooltip:AddLine(data.name, r, g, b)
    GameTooltip:AddLine(" ")

    -- Summary stats
    GameTooltip:AddDoubleLine("Damage:", self:FormatNumber(data.damage), 1, 0.82, 0, 1, 1, 1)
    GameTooltip:AddDoubleLine("Healing:", self:FormatNumber(data.healing), 1, 0.82, 0, 1, 1, 1)
    if duration > 0 then
        GameTooltip:AddDoubleLine("DPS:", self:FormatNumber(data.damage / duration), 1, 0.82, 0, 1, 1, 1)
        GameTooltip:AddDoubleLine("HPS:", self:FormatNumber(data.healing / duration), 1, 0.82, 0, 1, 1, 1)
    end
    if data.deaths > 0 then
        GameTooltip:AddDoubleLine("Deaths:", tostring(data.deaths), 1, 0.82, 0, 1, 0.2, 0.2)
    end

    -- Top spells
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("Top Spells:", 1, 0.82, 0)

    local viewMode = self.db.currentView
    local isHeal = (viewMode == "healing" or viewMode == "hps")

    -- Sort spells by value
    local spellList = {}
    for spellID, spell in pairs(data.spells) do
        local val = isHeal and spell.healing or spell.damage
        if val > 0 then
            table.insert(spellList, {
                name  = spell.name,
                value = val,
                hits  = spell.hits,
                crits = spell.crits,
            })
        end
    end
    table.sort(spellList, function(a, b) return a.value > b.value end)

    local totalValue = isHeal and data.healing or data.damage
    for i = 1, math.min(8, #spellList) do
        local s = spellList[i]
        local pct = totalValue > 0 and (s.value / totalValue * 100) or 0
        local critPct = s.hits > 0 and (s.crits / s.hits * 100) or 0
        GameTooltip:AddDoubleLine(
            string.format("  %s", s.name),
            string.format("%s (%.1f%%) %d%% crit", self:FormatNumber(s.value), pct, critPct),
            1, 1, 1,
            0.8, 0.8, 0.8
        )
    end

    -- Pet info
    local hasPets = false
    for _ in pairs(data.pets) do hasPets = true; break end
    if hasPets then
        GameTooltip:AddLine(" ")
        GameTooltip:AddLine("Pets:", 1, 0.82, 0)
        for petGUID, petName in pairs(data.pets) do
            GameTooltip:AddLine("  " .. petName, 0.7, 0.7, 0.7)
        end
    end

    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("Left-click for detailed breakdown", 0.5, 0.5, 0.5)

    GameTooltip:Show()
end
