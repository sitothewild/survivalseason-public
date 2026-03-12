----------------------------------------------------------------------
-- SitoDamageMeter - Detail View
-- Shows per-player spell breakdown in a popup window
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Detail window state
----------------------------------------------------------------------
local detailFrame = nil
local detailBars = {}
local detailScrollOffset = 0
local detailViewMode = "spells"  -- "spells" or "targets"
local detailGUID = nil

----------------------------------------------------------------------
-- Create the detail window
----------------------------------------------------------------------
local function CreateDetailFrame()
    local f = CreateFrame("Frame", "SitoDMDetailFrame", UIParent, "BackdropTemplate")
    f:SetSize(320, 350)
    f:SetPoint("LEFT", SDM.mainFrame, "RIGHT", 4, 0)
    f:SetClampedToScreen(true)
    f:SetMovable(true)
    f:SetFrameStrata("HIGH")
    f:SetFrameLevel(110)

    f:SetBackdrop({
        bgFile   = "Interface\\ChatFrame\\ChatFrameBackground",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        edgeSize = 12,
        insets   = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    f:SetBackdropColor(0.05, 0.05, 0.05, 0.92)
    f:SetBackdropBorderColor(0.3, 0.3, 0.3, 0.8)

    -- Title bar
    local titleBar = CreateFrame("Frame", nil, f, "BackdropTemplate")
    titleBar:SetHeight(22)
    titleBar:SetPoint("TOPLEFT", f, "TOPLEFT", 3, -3)
    titleBar:SetPoint("TOPRIGHT", f, "TOPRIGHT", -3, -3)
    titleBar:SetBackdrop({ bgFile = "Interface\\ChatFrame\\ChatFrameBackground" })
    titleBar:SetBackdropColor(0.1, 0.1, 0.1, 0.95)
    titleBar:EnableMouse(true)
    titleBar:RegisterForDrag("LeftButton")
    titleBar:SetScript("OnDragStart", function() f:StartMoving() end)
    titleBar:SetScript("OnDragStop", function() f:StopMovingOrSizing() end)

    local titleText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    titleText:SetPoint("LEFT", titleBar, "LEFT", 6, 0)
    titleText:SetTextColor(1, 0.82, 0)
    f.titleText = titleText

    -- Close button
    local closeBtn = CreateFrame("Button", nil, titleBar, "UIPanelCloseButton")
    closeBtn:SetSize(20, 20)
    closeBtn:SetPoint("RIGHT", titleBar, "RIGHT", 0, 0)
    closeBtn:SetScript("OnClick", function() f:Hide() end)

    -- Tab buttons: Spells / Targets
    local tabFrame = CreateFrame("Frame", nil, f)
    tabFrame:SetHeight(18)
    tabFrame:SetPoint("TOPLEFT", titleBar, "BOTTOMLEFT", 0, -1)
    tabFrame:SetPoint("TOPRIGHT", titleBar, "BOTTOMRIGHT", 0, -1)

    local tabBg = tabFrame:CreateTexture(nil, "BACKGROUND")
    tabBg:SetAllPoints()
    tabBg:SetColorTexture(0.08, 0.08, 0.08, 0.95)

    local spellsTab = CreateFrame("Button", nil, tabFrame)
    spellsTab:SetSize(80, 18)
    spellsTab:SetPoint("LEFT", tabFrame, "LEFT", 10, 0)
    local spellsText = spellsTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    spellsText:SetPoint("CENTER")
    spellsText:SetText("Spells")
    spellsTab.text = spellsText
    f.spellsTab = spellsTab

    local targetsTab = CreateFrame("Button", nil, tabFrame)
    targetsTab:SetSize(80, 18)
    targetsTab:SetPoint("LEFT", spellsTab, "RIGHT", 10, 0)
    local targetsText = targetsTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    targetsText:SetPoint("CENTER")
    targetsText:SetText("Targets")
    targetsTab.text = targetsText
    f.targetsTab = targetsTab

    spellsTab:SetScript("OnClick", function()
        detailViewMode = "spells"
        SDM:UpdateDetailBars()
    end)

    targetsTab:SetScript("OnClick", function()
        detailViewMode = "targets"
        SDM:UpdateDetailBars()
    end)

    -- Bar container
    local container = CreateFrame("Frame", nil, f)
    container:SetPoint("TOPLEFT", tabFrame, "BOTTOMLEFT", 3, -2)
    container:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -3, 5)
    container:SetClipsChildren(true)
    container:EnableMouseWheel(true)
    container:SetScript("OnMouseWheel", function(self, delta)
        detailScrollOffset = detailScrollOffset - delta
        if detailScrollOffset < 0 then detailScrollOffset = 0 end
        SDM:UpdateDetailBars()
    end)
    f.barContainer = container

    -- Summary line at top of container
    local summary = container:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    summary:SetPoint("TOPLEFT", container, "TOPLEFT", 2, 0)
    summary:SetPoint("TOPRIGHT", container, "TOPRIGHT", -2, 0)
    summary:SetHeight(16)
    summary:SetJustifyH("LEFT")
    summary:SetTextColor(0.7, 0.7, 0.7)
    f.summaryText = summary

    f:Hide()
    return f
end

----------------------------------------------------------------------
-- Show player detail
----------------------------------------------------------------------
function SDM:ShowPlayerDetail(guid)
    if not detailFrame then
        detailFrame = CreateDetailFrame()
    end

    detailGUID = guid
    detailScrollOffset = 0
    detailViewMode = "spells"

    self:UpdateDetailBars()
    detailFrame:Show()
end

----------------------------------------------------------------------
-- Update detail bars
----------------------------------------------------------------------
function SDM:UpdateDetailBars()
    if not detailFrame or not detailFrame:IsShown() then return end

    local players = self:GetDisplayPlayers()
    local data = players[detailGUID]
    if not data then
        detailFrame:Hide()
        return
    end

    -- Update title
    local r, g, b = self:GetClassColor(data.class)
    detailFrame.titleText:SetText(data.name)
    detailFrame.titleText:SetTextColor(r, g, b)

    -- Update tab highlights
    if detailViewMode == "spells" then
        detailFrame.spellsTab.text:SetTextColor(0, 0.8, 1)
        detailFrame.targetsTab.text:SetTextColor(0.5, 0.5, 0.5)
    else
        detailFrame.spellsTab.text:SetTextColor(0.5, 0.5, 0.5)
        detailFrame.targetsTab.text:SetTextColor(0, 0.8, 1)
    end

    -- Release old bars
    for _, bar in ipairs(detailBars) do
        bar:Hide()
    end
    wipe(detailBars)

    local viewMode = self.db.currentView
    local isHeal = (viewMode == "healing" or viewMode == "hps")

    -- Build sorted list
    local sorted = {}

    if detailViewMode == "spells" then
        for spellID, spell in pairs(data.spells) do
            local value = isHeal and spell.healing or spell.damage
            if value > 0 then
                table.insert(sorted, {
                    name   = spell.name,
                    value  = value,
                    hits   = spell.hits,
                    crits  = spell.crits,
                    misses = spell.misses,
                    min    = spell.min < 999999999 and spell.min or 0,
                    max    = spell.max,
                    school = spell.school,
                })
            end
        end
    else
        for targetName, target in pairs(data.targets) do
            local value = isHeal and target.healing or target.damage
            if value > 0 then
                table.insert(sorted, {
                    name  = targetName,
                    value = value,
                })
            end
        end
    end

    table.sort(sorted, function(a, b) return a.value > b.value end)

    -- Total for percentages
    local totalValue = isHeal and data.healing or data.damage
    local maxValue = sorted[1] and sorted[1].value or 0

    -- Summary
    local duration = self:GetDisplayDuration()
    local summaryStr = string.format(
        "Total: %s | Duration: %s | DPS: %s",
        self:FormatNumber(data.damage),
        self:FormatTime(duration),
        duration > 0 and self:FormatNumber(data.damage / duration) or "0"
    )
    if isHeal then
        summaryStr = string.format(
            "Total Heal: %s | Duration: %s | HPS: %s",
            self:FormatNumber(data.healing),
            self:FormatTime(duration),
            duration > 0 and self:FormatNumber(data.healing / duration) or "0"
        )
    end
    detailFrame.summaryText:SetText(summaryStr)

    -- Create detail bars
    local barHeight = 17
    local barSpacing = 1
    local container = detailFrame.barContainer
    local startY = -18  -- below summary
    local containerHeight = container:GetHeight() - 18
    local maxVisible = math.floor(containerHeight / (barHeight + barSpacing))
    local maxScroll = math.max(0, #sorted - maxVisible)
    if detailScrollOffset > maxScroll then detailScrollOffset = maxScroll end

    for i = 1, math.min(maxVisible, #sorted) do
        local idx = i + detailScrollOffset
        local d = sorted[idx]
        if not d then break end

        local bar = CreateFrame("Frame", nil, container)
        bar:SetHeight(barHeight)
        bar:SetPoint("TOPLEFT", container, "TOPLEFT", 0, startY - ((i - 1) * (barHeight + barSpacing)))
        bar:SetPoint("TOPRIGHT", container, "TOPRIGHT", 0, startY - ((i - 1) * (barHeight + barSpacing)))

        -- Background
        local bg = bar:CreateTexture(nil, "BACKGROUND")
        bg:SetAllPoints()
        bg:SetColorTexture(0.1, 0.1, 0.1, 0.6)

        -- Fill bar
        local fill = bar:CreateTexture(nil, "ARTWORK")
        fill:SetPoint("TOPLEFT")
        fill:SetPoint("BOTTOMLEFT")
        local fillPct = maxValue > 0 and (d.value / maxValue) or 0
        fill:SetWidth(bar:GetWidth() * fillPct)
        fill:SetTexture(self.db.barTexture)

        -- Color by school for spells, class color for targets
        if detailViewMode == "spells" and d.school then
            local sc = SCHOOL_COLORS[d.school]
            if sc then
                fill:SetVertexColor(sc[1], sc[2], sc[3], 0.7)
            else
                fill:SetVertexColor(r, g, b, 0.7)
            end
        else
            fill:SetVertexColor(r, g, b, 0.7)
        end

        -- Recalc fill on size change
        bar:SetScript("OnSizeChanged", function(self, w, h)
            fill:SetWidth(w * fillPct)
        end)

        -- Name
        local nameStr = bar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        nameStr:SetPoint("LEFT", bar, "LEFT", 4, 0)
        nameStr:SetPoint("RIGHT", bar, "RIGHT", -100, 0)
        nameStr:SetJustifyH("LEFT")
        nameStr:SetWordWrap(false)
        nameStr:SetText(d.name)
        nameStr:SetTextColor(1, 1, 1)

        -- Value + percent
        local pct = totalValue > 0 and (d.value / totalValue * 100) or 0
        local valStr = bar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        valStr:SetPoint("RIGHT", bar, "RIGHT", -3, 0)
        valStr:SetJustifyH("RIGHT")

        local valueLabel = string.format("%s (%.1f%%)", self:FormatNumber(d.value), pct)
        if detailViewMode == "spells" and d.hits then
            local critPct = d.hits > 0 and (d.crits / d.hits * 100) or 0
            valueLabel = string.format("%s %.1f%% | %d%% crit",
                self:FormatNumber(d.value), pct, critPct)
        end
        valStr:SetText(valueLabel)
        valStr:SetTextColor(0.9, 0.9, 0.9)

        -- Tooltip for spells
        if detailViewMode == "spells" and d.hits then
            bar:EnableMouse(true)
            bar:SetScript("OnEnter", function(self)
                GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                GameTooltip:ClearLines()
                GameTooltip:AddLine(d.name, 1, 0.82, 0)
                GameTooltip:AddLine(" ")
                GameTooltip:AddDoubleLine("Total:", SDM:FormatNumber(d.value), 1, 1, 1, 1, 1, 1)
                GameTooltip:AddDoubleLine("Hits:", tostring(d.hits), 1, 1, 1, 1, 1, 1)
                GameTooltip:AddDoubleLine("Crits:", tostring(d.crits), 1, 1, 1, 1, 1, 1)
                if d.hits > 0 then
                    GameTooltip:AddDoubleLine("Crit %:", string.format("%.1f%%", d.crits / d.hits * 100), 1, 1, 1, 1, 1, 1)
                    GameTooltip:AddDoubleLine("Average:", SDM:FormatNumber(d.value / d.hits), 1, 1, 1, 1, 1, 1)
                end
                if d.min and d.min > 0 then
                    GameTooltip:AddDoubleLine("Min:", SDM:FormatNumber(d.min), 1, 1, 1, 1, 1, 1)
                end
                if d.max and d.max > 0 then
                    GameTooltip:AddDoubleLine("Max:", SDM:FormatNumber(d.max), 1, 1, 1, 1, 1, 1)
                end
                if d.misses and d.misses > 0 then
                    GameTooltip:AddDoubleLine("Misses:", tostring(d.misses), 1, 1, 1, 1, 0.2, 0.2)
                end
                GameTooltip:Show()
            end)
            bar:SetScript("OnLeave", function()
                GameTooltip:Hide()
            end)
        end

        table.insert(detailBars, bar)
    end
end

----------------------------------------------------------------------
-- School color lookup (exported for other modules)
----------------------------------------------------------------------
SDM.SCHOOL_COLORS = SCHOOL_COLORS
