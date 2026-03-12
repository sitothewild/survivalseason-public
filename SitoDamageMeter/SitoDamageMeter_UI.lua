----------------------------------------------------------------------
-- SitoDamageMeter - UI
-- Main window frame, title bar, view switching, segment dropdown
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Color constants
----------------------------------------------------------------------
local COLORS = {
    bg          = { 0.05, 0.05, 0.05, 0.85 },
    titleBg     = { 0.1, 0.1, 0.1, 0.95 },
    border      = { 0.3, 0.3, 0.3, 0.8 },
    titleText   = { 1, 0.82, 0, 1 },
    normalText  = { 1, 1, 1, 1 },
    dimText     = { 0.6, 0.6, 0.6, 1 },
    highlight   = { 1, 1, 1, 0.05 },
    activeTab   = { 0, 0.8, 1, 1 },
    inactiveTab = { 0.5, 0.5, 0.5, 1 },
}

----------------------------------------------------------------------
-- View mode labels
----------------------------------------------------------------------
local VIEW_LABELS = {
    damage  = "Damage",
    healing = "Healing",
    dps     = "DPS",
    hps     = "HPS",
}

----------------------------------------------------------------------
-- Initialize the UI
----------------------------------------------------------------------
function SDM:InitUI()
    self:CreateMainFrame()
    self:CreateTitleBar()
    self:CreateViewTabs()
    self:CreateBarContainer()
    self:CreateResizeHandle()
    self:CreateSegmentDropdown()

    -- Update timer (throttled refresh)
    self.updateInterval = 0.5
    self.timeSinceLastUpdate = 0
    self.mainFrame:SetScript("OnUpdate", function(frame, elapsed)
        self.timeSinceLastUpdate = self.timeSinceLastUpdate + elapsed
        if self.timeSinceLastUpdate >= self.updateInterval then
            self.timeSinceLastUpdate = 0
            if self.dataDirty then
                self:UpdateBars()
                self.dataDirty = false
            end
            -- Always update title time during combat
            if self.activeFight then
                self:UpdateTitleText()
                self.dataDirty = true  -- Keep refreshing during combat
            end
        end
    end)

    -- Show/hide based on settings
    if self.db.showOnLogin then
        self.mainFrame:Show()
    else
        self.mainFrame:Hide()
    end
end

----------------------------------------------------------------------
-- Main frame
----------------------------------------------------------------------
function SDM:CreateMainFrame()
    local f = CreateFrame("Frame", "SitoDamageMeterFrame", UIParent, "BackdropTemplate")
    f:SetSize(self.db.frameWidth, self.db.frameHeight)
    f:SetClampedToScreen(true)
    f:SetMovable(true)
    f:SetResizable(true)
    f:SetResizeBounds(180, 100, 500, 600)
    f:SetFrameStrata("MEDIUM")
    f:SetFrameLevel(100)

    -- Restore position
    local p = self.db.framePoint
    if p and p[1] then
        f:ClearAllPoints()
        f:SetPoint(p[1], UIParent, p[3] or p[1], p[4] or 0, p[5] or 0)
    else
        f:SetPoint("RIGHT", UIParent, "RIGHT", -20, 0)
    end

    -- Backdrop
    f:SetBackdrop({
        bgFile   = "Interface\\ChatFrame\\ChatFrameBackground",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        edgeSize = 12,
        insets   = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    f:SetBackdropColor(unpack(COLORS.bg))
    f:SetBackdropBorderColor(unpack(COLORS.border))

    -- Save position on drag
    f:SetScript("OnDragStop", function(frame)
        frame:StopMovingOrSizing()
        local point, _, relPoint, x, y = frame:GetPoint()
        self.db.framePoint = { point, nil, relPoint, x, y }
    end)

    -- Save size on resize
    f:SetScript("OnSizeChanged", function(frame, w, h)
        self.db.frameWidth = math.floor(w)
        self.db.frameHeight = math.floor(h)
        self:UpdateBars()
    end)

    self.mainFrame = f
end

----------------------------------------------------------------------
-- Title bar
----------------------------------------------------------------------
function SDM:CreateTitleBar()
    local f = self.mainFrame

    local titleBar = CreateFrame("Frame", nil, f, "BackdropTemplate")
    titleBar:SetHeight(22)
    titleBar:SetPoint("TOPLEFT", f, "TOPLEFT", 3, -3)
    titleBar:SetPoint("TOPRIGHT", f, "TOPRIGHT", -3, -3)
    titleBar:SetBackdrop({
        bgFile = "Interface\\ChatFrame\\ChatFrameBackground",
    })
    titleBar:SetBackdropColor(unpack(COLORS.titleBg))

    -- Enable dragging
    titleBar:EnableMouse(true)
    titleBar:RegisterForDrag("LeftButton")
    titleBar:SetScript("OnDragStart", function()
        if not self.db.locked then
            f:StartMoving()
        end
    end)
    titleBar:SetScript("OnDragStop", function()
        f:StopMovingOrSizing()
        local point, _, relPoint, x, y = f:GetPoint()
        self.db.framePoint = { point, nil, relPoint, x, y }
    end)

    -- Title text
    local titleText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    titleText:SetPoint("LEFT", titleBar, "LEFT", 6, 0)
    titleText:SetTextColor(unpack(COLORS.titleText))
    titleText:SetText("Sito DM")
    self.titleText = titleText

    -- Duration text
    local durationText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    durationText:SetPoint("CENTER", titleBar, "CENTER", 0, 0)
    durationText:SetTextColor(unpack(COLORS.dimText))
    durationText:SetText("")
    self.durationText = durationText

    -- Close button
    local closeBtn = CreateFrame("Button", nil, titleBar)
    closeBtn:SetSize(16, 16)
    closeBtn:SetPoint("RIGHT", titleBar, "RIGHT", -4, 0)
    closeBtn:SetNormalTexture("Interface\\Buttons\\UI-Panel-MinimizeButton-Up")
    closeBtn:SetHighlightTexture("Interface\\Buttons\\UI-Panel-MinimizeButton-Highlight")
    closeBtn:SetScript("OnClick", function()
        f:Hide()
    end)

    -- Reset button
    local resetBtn = CreateFrame("Button", nil, titleBar)
    resetBtn:SetSize(16, 16)
    resetBtn:SetPoint("RIGHT", closeBtn, "LEFT", -2, 0)
    resetBtn:SetNormalFontObject("GameFontNormalSmall")
    resetBtn:SetHighlightFontObject("GameFontHighlightSmall")

    local resetText = resetBtn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    resetText:SetPoint("CENTER")
    resetText:SetText("R")
    resetText:SetTextColor(0.8, 0.2, 0.2)
    resetBtn:SetScript("OnClick", function()
        SDM:ResetData()
    end)
    resetBtn:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_TOP")
        GameTooltip:SetText("Reset all data")
        GameTooltip:Show()
    end)
    resetBtn:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)

    -- Right-click context menu on title
    titleBar:SetScript("OnMouseDown", function(self, button)
        if button == "RightButton" then
            SDM:ShowContextMenu()
        end
    end)

    self.titleBar = titleBar
end

----------------------------------------------------------------------
-- Update title text
----------------------------------------------------------------------
function SDM:UpdateTitleText()
    local duration = self:GetDisplayDuration()
    local segName = self:GetDisplayName()

    if duration > 0 then
        self.durationText:SetText(self:FormatTime(duration))
    else
        self.durationText:SetText("")
    end
end

----------------------------------------------------------------------
-- View tabs (Damage / Healing / DPS / HPS)
----------------------------------------------------------------------
function SDM:CreateViewTabs()
    local f = self.mainFrame
    self.viewTabs = {}

    local tabContainer = CreateFrame("Frame", nil, f)
    tabContainer:SetHeight(16)
    tabContainer:SetPoint("TOPLEFT", self.titleBar, "BOTTOMLEFT", 0, -1)
    tabContainer:SetPoint("TOPRIGHT", self.titleBar, "BOTTOMRIGHT", 0, -1)
    tabContainer:SetScript("OnMouseDown", function(self, button)
        if button == "RightButton" then
            SDM:ShowContextMenu()
        end
    end)

    local bg = tabContainer:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0.08, 0.08, 0.08, 0.95)

    local views = { "damage", "healing", "dps", "hps" }
    local tabWidth = 1 / #views

    for i, view in ipairs(views) do
        local tab = CreateFrame("Button", nil, tabContainer)
        tab:SetHeight(16)
        tab:SetPoint("TOPLEFT", tabContainer, "TOPLEFT", (i - 1) * tabContainer:GetWidth() / #views, 0)
        tab:SetPoint("BOTTOMLEFT", tabContainer, "BOTTOMLEFT", (i - 1) * tabContainer:GetWidth() / #views, 0)

        -- Use relative positioning
        if i == 1 then
            tab:SetPoint("LEFT", tabContainer, "LEFT", 0, 0)
        else
            tab:SetPoint("LEFT", self.viewTabs[i - 1], "RIGHT", 0, 0)
        end
        tab:SetWidth(tabContainer:GetWidth() / #views)

        local text = tab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        text:SetPoint("CENTER")
        text:SetText(VIEW_LABELS[view])

        tab.view = view
        tab.text = text

        tab:SetScript("OnClick", function()
            self.db.currentView = view
            self:UpdateViewTabs()
            self:UpdateBars()
        end)

        tab:SetScript("OnSizeChanged", function(btn, w, h)
            -- Tabs resize with parent
        end)

        -- Update tab widths on container resize
        tabContainer:HookScript("OnSizeChanged", function(container, w, h)
            tab:SetWidth(w / #views)
        end)

        self.viewTabs[i] = tab
    end

    self.tabContainer = tabContainer
    self:UpdateViewTabs()
end

function SDM:UpdateViewTabs()
    for _, tab in ipairs(self.viewTabs) do
        if tab.view == self.db.currentView then
            tab.text:SetTextColor(unpack(COLORS.activeTab))
        else
            tab.text:SetTextColor(unpack(COLORS.inactiveTab))
        end
    end
end

----------------------------------------------------------------------
-- Bar container (scrollable area)
----------------------------------------------------------------------
function SDM:CreateBarContainer()
    local f = self.mainFrame

    local container = CreateFrame("Frame", nil, f)
    container:SetPoint("TOPLEFT", self.tabContainer, "BOTTOMLEFT", 3, -2)
    container:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -3, 14)
    container:SetClipsChildren(true)

    -- Enable scroll
    container:EnableMouseWheel(true)
    container:SetScript("OnMouseWheel", function(self, delta)
        SDM.scrollOffset = (SDM.scrollOffset or 0) - delta
        if SDM.scrollOffset < 0 then SDM.scrollOffset = 0 end
        SDM:UpdateBars()
    end)

    -- Right click on container
    container:SetScript("OnMouseDown", function(self, button)
        if button == "RightButton" then
            SDM:ShowContextMenu()
        end
    end)

    self.barContainer = container
    self.scrollOffset = 0
end

----------------------------------------------------------------------
-- Resize handle
----------------------------------------------------------------------
function SDM:CreateResizeHandle()
    local f = self.mainFrame

    local grip = CreateFrame("Button", nil, f)
    grip:SetSize(16, 16)
    grip:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -2, 2)
    grip:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
    grip:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
    grip:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")

    grip:SetScript("OnMouseDown", function()
        if not self.db.locked then
            f:StartSizing("BOTTOMRIGHT")
        end
    end)
    grip:SetScript("OnMouseUp", function()
        f:StopMovingOrSizing()
        self.db.frameWidth = math.floor(f:GetWidth())
        self.db.frameHeight = math.floor(f:GetHeight())
    end)
end

----------------------------------------------------------------------
-- Segment dropdown
----------------------------------------------------------------------
function SDM:CreateSegmentDropdown()
    -- Small clickable segment text at the bottom-left
    local segText = self.mainFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    segText:SetPoint("BOTTOMLEFT", self.mainFrame, "BOTTOMLEFT", 6, 2)
    segText:SetTextColor(unpack(COLORS.dimText))
    segText:SetText("Current")

    local segBtn = CreateFrame("Button", nil, self.mainFrame)
    segBtn:SetAllPoints(segText)
    segBtn:SetScript("OnClick", function()
        self:ShowSegmentMenu()
    end)
    segBtn:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_TOP")
        GameTooltip:SetText("Click to select a fight segment")
        GameTooltip:Show()
    end)
    segBtn:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)

    self.segmentText = segText
end

function SDM:UpdateSegmentText()
    if self.segmentText then
        self.segmentText:SetText(self:GetDisplayName())
    end
end

----------------------------------------------------------------------
-- Segment selection menu
----------------------------------------------------------------------
function SDM:ShowSegmentMenu()
    local menu = {}

    -- Current / live option
    table.insert(menu, {
        text = "Current",
        checked = (self.selectedSegmentIndex == 0),
        func = function() self:SelectSegment(0) end,
    })

    -- Past segments
    for i, seg in ipairs(self.segments) do
        local label = seg.name or ("Segment " .. i)
        if seg.isBoss then
            if seg.success then
                label = "|cff00ff00" .. label .. "|r"
            else
                label = "|cffff0000" .. label .. "|r"
            end
        end
        table.insert(menu, {
            text = label,
            checked = (self.selectedSegmentIndex == i),
            func = function() self:SelectSegment(i) end,
        })
    end

    -- Use the simple dropdown
    self:ShowSimpleMenu(menu, self.segmentText)
end

----------------------------------------------------------------------
-- Context menu (right-click on title/background)
----------------------------------------------------------------------
function SDM:ShowContextMenu()
    local menu = {
        {
            text = "Damage",
            checked = (self.db.currentView == "damage"),
            func = function()
                self.db.currentView = "damage"
                self:UpdateViewTabs()
                self:UpdateBars()
            end,
        },
        {
            text = "Healing",
            checked = (self.db.currentView == "healing"),
            func = function()
                self.db.currentView = "healing"
                self:UpdateViewTabs()
                self:UpdateBars()
            end,
        },
        {
            text = "DPS",
            checked = (self.db.currentView == "dps"),
            func = function()
                self.db.currentView = "dps"
                self:UpdateViewTabs()
                self:UpdateBars()
            end,
        },
        {
            text = "HPS",
            checked = (self.db.currentView == "hps"),
            func = function()
                self.db.currentView = "hps"
                self:UpdateViewTabs()
                self:UpdateBars()
            end,
        },
        { text = "", disabled = true },  -- separator
        {
            text = self.db.locked and "Unlock Window" or "Lock Window",
            func = function()
                self.db.locked = not self.db.locked
                print("|cff00ccffSito DM|r: Window " .. (self.db.locked and "locked" or "unlocked"))
            end,
        },
        {
            text = "Reset Data",
            func = function() self:ResetData() end,
        },
    }

    self:ShowSimpleMenu(menu, self.titleBar)
end

----------------------------------------------------------------------
-- Simple popup menu implementation
----------------------------------------------------------------------
do
    local menuFrame = nil

    function SDM:ShowSimpleMenu(items, anchor)
        if not menuFrame then
            menuFrame = CreateFrame("Frame", "SitoDMMenuFrame", UIParent, "UIDropDownMenuTemplate")
        end

        local function InitMenu(frame, level)
            for _, item in ipairs(items) do
                local info = UIDropDownMenu_CreateInfo()
                info.text = item.text
                info.func = item.func
                info.checked = item.checked
                info.disabled = item.disabled
                info.isTitle = item.disabled and item.text == ""
                info.notCheckable = not item.checked
                UIDropDownMenu_AddButton(info, level or 1)
            end
        end

        EasyMenu(items, menuFrame, anchor or "cursor", 0, 0, "MENU")
    end
end

----------------------------------------------------------------------
-- Toggle main frame
----------------------------------------------------------------------
function SDM:ToggleWindow()
    if self.mainFrame:IsShown() then
        self.mainFrame:Hide()
    else
        self.mainFrame:Show()
    end
end
