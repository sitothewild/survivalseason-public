----------------------------------------------------------------------
-- SitoDamageMeter - Slash Commands & Minimap Button
----------------------------------------------------------------------

local ADDON_NAME, SDM = ...

----------------------------------------------------------------------
-- Slash commands
----------------------------------------------------------------------
function SDM:RegisterSlashCommands()
    SLASH_SITODM1 = "/sdm"
    SLASH_SITODM2 = "/sitodm"
    SLASH_SITODM3 = "/sitodamagemeter"

    SlashCmdList["SITODM"] = function(msg)
        msg = (msg or ""):lower():trim()

        if msg == "" or msg == "toggle" then
            self:ToggleWindow()
        elseif msg == "show" then
            self.mainFrame:Show()
        elseif msg == "hide" then
            self.mainFrame:Hide()
        elseif msg == "reset" then
            self:ResetData()
        elseif msg == "lock" then
            self.db.locked = true
            print("|cff00ccffSito DM|r: Window locked.")
        elseif msg == "unlock" then
            self.db.locked = false
            print("|cff00ccffSito DM|r: Window unlocked.")
        elseif msg == "damage" or msg == "d" then
            self.db.currentView = "damage"
            self:UpdateViewTabs()
            self:UpdateBars()
        elseif msg == "healing" or msg == "h" then
            self.db.currentView = "healing"
            self:UpdateViewTabs()
            self:UpdateBars()
        elseif msg == "dps" then
            self.db.currentView = "dps"
            self:UpdateViewTabs()
            self:UpdateBars()
        elseif msg == "hps" then
            self.db.currentView = "hps"
            self:UpdateViewTabs()
            self:UpdateBars()
        elseif msg == "report" or msg:match("^report") then
            self:ReportToChat(msg)
        elseif msg == "config" or msg == "options" then
            self:ShowConfig()
        elseif msg == "minimap" then
            self.db.minimap.hide = not self.db.minimap.hide
            if self.db.minimap.hide then
                if self.minimapButton then self.minimapButton:Hide() end
                print("|cff00ccffSito DM|r: Minimap button hidden.")
            else
                if self.minimapButton then self.minimapButton:Show() end
                print("|cff00ccffSito DM|r: Minimap button shown.")
            end
        else
            -- Help text
            print("|cff00ccffSito Damage Meter|r commands:")
            print("  |cff00ccff/sdm|r - Toggle window")
            print("  |cff00ccff/sdm show|r - Show window")
            print("  |cff00ccff/sdm hide|r - Hide window")
            print("  |cff00ccff/sdm reset|r - Reset all data")
            print("  |cff00ccff/sdm lock|r - Lock window position")
            print("  |cff00ccff/sdm unlock|r - Unlock window position")
            print("  |cff00ccff/sdm damage|r - Switch to damage view")
            print("  |cff00ccff/sdm healing|r - Switch to healing view")
            print("  |cff00ccff/sdm dps|r - Switch to DPS view")
            print("  |cff00ccff/sdm hps|r - Switch to HPS view")
            print("  |cff00ccff/sdm report [say|party|raid|guild]|r - Report to chat")
            print("  |cff00ccff/sdm minimap|r - Toggle minimap button")
        end
    end
end

----------------------------------------------------------------------
-- Report to chat
----------------------------------------------------------------------
function SDM:ReportToChat(msg)
    -- Parse channel from message
    local channel = "say"
    local _, _, ch = msg:find("report%s+(%w+)")
    if ch then
        channel = ch:lower()
    end

    -- Map to SendChatMessage channel
    local chatType
    if channel == "say" then
        chatType = "SAY"
    elseif channel == "party" then
        chatType = "PARTY"
    elseif channel == "raid" then
        chatType = "RAID"
    elseif channel == "guild" then
        chatType = "GUILD"
    elseif channel == "instance" then
        chatType = "INSTANCE_CHAT"
    elseif channel == "whisper" or channel == "w" then
        print("|cff00ccffSito DM|r: Whisper report not supported. Use /sdm report [say|party|raid|guild]")
        return
    else
        chatType = "SAY"
    end

    local viewMode = self.db.currentView
    local viewLabel = VIEW_LABELS and VIEW_LABELS[viewMode] or viewMode

    -- Get sorted data
    local players = self:GetDisplayPlayers()
    local duration = self:GetDisplayDuration()
    local sorted = {}

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
            table.insert(sorted, { name = data.name, value = value })
        end
    end

    table.sort(sorted, function(a, b) return a.value > b.value end)

    -- Build report lines
    local segName = self:GetDisplayName()
    SendChatMessage("--- Sito DM: " .. viewLabel .. " (" .. segName .. ") ---", chatType)

    for i = 1, math.min(10, #sorted) do
        local d = sorted[i]
        local line = string.format("%d. %s - %s", i, d.name, self:FormatNumber(d.value))
        SendChatMessage(line, chatType)
    end
end

----------------------------------------------------------------------
-- Minimap button (simple LibDBIcon-free implementation)
----------------------------------------------------------------------
function SDM:CreateMinimapButton()
    local btn = CreateFrame("Button", "SitoDMMinimapButton", Minimap)
    btn:SetSize(32, 32)
    btn:SetFrameStrata("MEDIUM")
    btn:SetFrameLevel(8)
    btn:SetClampedToScreen(true)
    btn:SetMovable(true)

    -- Icon
    local icon = btn:CreateTexture(nil, "ARTWORK")
    icon:SetSize(20, 20)
    icon:SetPoint("CENTER")
    icon:SetTexture("Interface\\Icons\\Ability_Warrior_Bladestorm")
    btn.icon = icon

    -- Border overlay
    local border = btn:CreateTexture(nil, "OVERLAY")
    border:SetSize(54, 54)
    border:SetPoint("CENTER")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")

    -- Highlight
    local highlight = btn:CreateTexture(nil, "HIGHLIGHT")
    highlight:SetSize(24, 24)
    highlight:SetPoint("CENTER")
    highlight:SetTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
    highlight:SetBlendMode("ADD")

    -- Position around minimap
    local minimapAngle = 220  -- degrees
    local function UpdatePosition()
        local angle = math.rad(minimapAngle)
        local x = math.cos(angle) * 80
        local y = math.sin(angle) * 80
        btn:ClearAllPoints()
        btn:SetPoint("CENTER", Minimap, "CENTER", x, y)
    end

    -- Drag to reposition
    local isDragging = false
    btn:RegisterForDrag("LeftButton")
    btn:SetScript("OnDragStart", function()
        isDragging = true
    end)
    btn:SetScript("OnDragStop", function()
        isDragging = false
        -- Calculate new angle
        local mx, my = Minimap:GetCenter()
        local bx, by = btn:GetCenter()
        minimapAngle = math.deg(math.atan2(by - my, bx - mx))
        UpdatePosition()
    end)
    btn:SetScript("OnUpdate", function()
        if isDragging then
            local mx, my = Minimap:GetCenter()
            local cx, cy = GetCursorPosition()
            local scale = UIParent:GetEffectiveScale()
            cx, cy = cx / scale, cy / scale
            minimapAngle = math.deg(math.atan2(cy - my, cx - mx))
            UpdatePosition()
        end
    end)

    -- Click handlers
    btn:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    btn:SetScript("OnClick", function(self, button)
        if button == "LeftButton" then
            SDM:ToggleWindow()
        elseif button == "RightButton" then
            SDM:ResetData()
        end
    end)

    -- Tooltip
    btn:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:AddLine("Sito Damage Meter", 1, 0.82, 0)
        GameTooltip:AddLine("Left-click: Toggle window", 1, 1, 1)
        GameTooltip:AddLine("Right-click: Reset data", 1, 1, 1)
        GameTooltip:AddLine("Drag: Move button", 0.7, 0.7, 0.7)
        GameTooltip:Show()
    end)
    btn:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)

    UpdatePosition()

    if self.db.minimap.hide then
        btn:Hide()
    end

    self.minimapButton = btn
end

-- Hook into login to create minimap button
local origLogin = SDM.OnPlayerLogin
function SDM:OnPlayerLogin()
    origLogin(self)
    self:CreateMinimapButton()
end

----------------------------------------------------------------------
-- Simple config display (print-based for now)
----------------------------------------------------------------------
function SDM:ShowConfig()
    print("|cff00ccffSito Damage Meter|r Configuration:")
    print("  Window Locked: " .. tostring(self.db.locked))
    print("  Show Rank: " .. tostring(self.db.showRank))
    print("  Show Percent: " .. tostring(self.db.showPercent))
    print("  Bar Height: " .. tostring(self.db.barHeight))
    print("  Class Colors: " .. tostring(self.db.classColors))
    print("  Current View: " .. self.db.currentView)
    print("  Minimap Button: " .. (self.db.minimap.hide and "hidden" or "shown"))
    print(" ")
    print("Use right-click on the meter for more options.")
end
