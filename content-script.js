/**
 * Personio Overtime Adjuster Extension
 * Automatically adjusts overtime calculations by subtracting upcoming leave days
 */
class PersonioOvertimeAdjuster {
  constructor() {
    // Overtime calculation state
    this.originalHours = undefined;
    this.originalMinutes = undefined;
    this.workTimePerDayInMinutes = undefined;

    // Page monitoring
    this.observer = null;
    this.urlCheckInterval = null;
    this.currentUrl = "";

    // URL patterns
    this.attendanceUrl = ".personio.com/attendance/employee";
    this.calendarUrl = ".personio.com/calendar/me";

    // Storage keys
    this.extractedDaysOffKey = "personioTimeAdjuster_extractedDaysOff";
    this.lastExtractionDateKey = "personioTimeAdjuster_lastExtractionDate";

    // Standard workday in minutes (8 hours)
    this.STANDARD_WORKDAY_MINUTES = 480;

    this.init();
  }

  init() {
    this.currentUrl = location.href;
    console.log(
      "PersonioOvertimeAdjuster: Initializing on URL:",
      this.currentUrl
    );

    this.setupUrlMonitoring();
    this.setupMessageListener();

    if (this.isAttendancePage()) {
      console.log(
        "PersonioOvertimeAdjuster: On attendance page, starting observer"
      );
      this.startObservingPage();
    } else if (this.isCalendarExtractionPage()) {
      console.log(
        "PersonioOvertimeAdjuster: On extraction page, handling calendar page"
      );
      this.handleCalendarPage();
    } else {
      console.log(
        "PersonioOvertimeAdjuster: Not on attendance or extraction page, doing nothing"
      );
    }
  }

  /**
   * Sets up message listener for calendar extraction results
   */
  setupMessageListener() {
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "personioCalendarExtraction") {
        this.handleCalendarExtractionResult(event.data.extractedDays);
      }
    });
  }

  /**
   * Handles calendar extraction results and updates the UI
   */
  handleCalendarExtractionResult(extractedDays) {
    const inputElement = document.getElementById("subtractTime");
    const reloadButton = document.querySelector(
      'button[title*="extract upcoming leave days"], button[title*="refresh upcoming leave days"]'
    );
    const backButton = document.querySelector(
      'button[title="Restore extracted future days off value"]'
    );

    if (!inputElement || !reloadButton) {
      return;
    }

    // Always reset button state first
    this.resetReloadButton(reloadButton);

    // Change: also update the input when extractedDays === "0" (previously skipped)
    if (extractedDays !== undefined && extractedDays !== null) {
      this.updateInputWithExtractedValue(
        inputElement,
        extractedDays,
        backButton
      );

      // Force update the reload button border after extraction (including when value is "0")
      setTimeout(() => {
        this.updateReloadButtonBorder(reloadButton);
      }, 100);
    } else {
      this.showExtractionFailedFeedback(reloadButton);
    }
  }

  /**
   * Updates input field with extracted value and provides visual feedback
   */
  updateInputWithExtractedValue(inputElement, extractedDays, backButton) {
    // Calculate visual adjustment for time-off days since last extraction
    const timeOffAdjustment = this.calculateTimeOffAdjustment();
    const adjustedValue = Math.max(
      0,
      parseFloat(extractedDays) - timeOffAdjustment
    ).toFixed(1);

    // Update the input field value
    inputElement.value = adjustedValue;

    // Force update the border color
    this.updateInputBorderColor(inputElement, adjustedValue, extractedDays);

    // Update back button visibility
    if (backButton) {
      this.updateBackButtonVisibility(adjustedValue, extractedDays);
    }

    // Trigger overtime adjustment calculation
    this.adjustOvertime();

    // Force update all related UI elements
    setTimeout(() => {
      const reloadButton = document.querySelector(
        'button[title*="extract upcoming leave days"], button[title*="refresh upcoming leave days"]'
      );
      if (reloadButton) {
        this.updateReloadButtonBorder(reloadButton);
      }
    }, 50);
  }

  /**
   * Shows visual feedback when extraction finds no results
   */
  showExtractionFailedFeedback(reloadButton) {
    // Visual feedback for failed extraction removed for theme compatibility
  }

  /**
   * Resets reload button to normal state
   */
  resetReloadButton(reloadButton) {
    reloadButton.textContent = "↺";
    reloadButton.disabled = false;
    reloadButton.title = "Open calendar page to extract upcoming leave days";

    // Update border color based on extraction status
    this.updateReloadButtonBorder(reloadButton);
  }

  /**
   * Sets up URL monitoring for page navigation
   */
  setupUrlMonitoring() {
    window.addEventListener("popstate", () => this.handleUrlChange());
    this.urlCheckInterval = setInterval(() => this.handleUrlChange(), 1000);
  }

  /**
   * Handles URL changes and manages page observers
   */
  handleUrlChange() {
    if (this.currentUrl !== location.href) {
      const wasAttendancePage = this.currentUrl.includes(this.attendanceUrl);
      const isAttendancePage = location.href.includes(this.attendanceUrl);
      const wasCalendarExtractionPage =
        this.currentUrl.includes(this.calendarUrl) &&
        this.currentUrl.includes(
          "absenceTypeId=0a405db0-f811-481e-a70b-5464ce2698ec"
        );
      const isCalendarExtractionPage = this.isCalendarExtractionPage();

      this.currentUrl = location.href;

      if (!wasAttendancePage && isAttendancePage) {
        this.startObservingPage();
      } else if (wasAttendancePage && !isAttendancePage) {
        this.stopObservingPage();
        this.resetState();
      }

      if (!wasCalendarExtractionPage && isCalendarExtractionPage) {
        console.log(
          "PersonioOvertimeAdjuster: URL change detected - triggering handleCalendarPage"
        );
        this.handleCalendarPage();
      } else {
        console.log(
          "PersonioOvertimeAdjuster: URL change - not triggering extraction. Was extraction page:",
          wasCalendarExtractionPage,
          "Is extraction page:",
          isCalendarExtractionPage
        );
      }
    }
  }

  /**
   * Checks if current page is an attendance page
   */
  isAttendancePage() {
    return location.href.includes(this.attendanceUrl);
  }

  /**
   * Checks if current page is a calendar page
   */
  isCalendarPage() {
    return location.href.includes(this.calendarUrl);
  }

  /**
   * Checks if current page is the specific calendar extraction URL
   */
  isCalendarExtractionPage() {
    return (
      location.href.includes(this.calendarUrl) &&
      location.href.includes(
        "absenceTypeId=0a405db0-f811-481e-a70b-5464ce2698ec"
      )
    );
  }

  /**
   * Handles calendar page - extracts future leave days and communicates back to attendance page
   */
  async handleCalendarPage() {
    console.log(
      "PersonioOvertimeAdjuster: handleCalendarPage called, current URL:",
      location.href
    );

    // Only extract if we're on the specific absence type page
    if (!this.isCalendarExtractionPage()) {
      console.log(
        "PersonioOvertimeAdjuster: On calendar page but not extraction URL, skipping extraction completely"
      );
      console.log(
        "PersonioOvertimeAdjuster: URL check - calendarUrl included:",
        location.href.includes(this.calendarUrl)
      );
      console.log(
        "PersonioOvertimeAdjuster: URL check - absenceTypeId included:",
        location.href.includes(
          "absenceTypeId=0a405db0-f811-481e-a70b-5464ce2698ec"
        )
      );
      return;
    }

    console.log(
      "PersonioOvertimeAdjuster: URL check passed, proceeding with extraction"
    );
    try {
      const extractedDays = await this.extractFutureLeaveDays();
      this.saveExtractedDaysOff(extractedDays);

      // Save the current date as last extraction date
      this.saveLastExtractionDate();

      // Auto-close with communication to parent window
      this.scheduleCalendarPageClose(extractedDays);
    } catch (error) {
      console.error("Error handling calendar page:", error);
      // Only save error values if we're on the correct extraction page
      if (this.isCalendarExtractionPage()) {
        this.saveExtractedDaysOff("0");
        this.scheduleCalendarPageClose("0");
      }
    }
  }

  /**
   * Extracts future leave days from calendar page
   */
  async extractFutureLeaveDays() {
    // Try multiple selectors for the dialog/drawer
    const selectors = [
      // New dialog structure
      '.DialogScrollSection-module__scrollSection___FljUx[data-test-id="absence-type-details-dialog-scroll-section"]',
      // Fallback to old drawer structure
      '.Drawer-module__RvA2hNuK__v5-6-2.AbsenceTypeDetailsDrawer-module__drawer___BLRib[data-state="show"]',
    ];

    let drawer = null;

    for (const selector of selectors) {
      drawer = await this.waitForElement(selector, 5000);
      if (drawer) {
        break;
      }
    }

    if (!drawer) {
      return "0";
    }

    // Wait for content to fully render
    await new Promise((resolve) => setTimeout(resolve, 500));

    const extractedMinutes = this.extractCalendarAbsenceData(document);

    if (extractedMinutes !== null && extractedMinutes > 0) {
      const daysValue = extractedMinutes / this.STANDARD_WORKDAY_MINUTES;
      const formattedDays = daysValue.toFixed(1);
      return formattedDays;
    } else {
      return "0";
    }
  }

  /**
   * Schedules calendar page to close and communicate results
   */
  scheduleCalendarPageClose(extractedValue) {
    setTimeout(() => {
      this.notifyParentWindow(extractedValue);

      // Only close the window if it was opened by the extension (has an opener)
      if (window.opener && !window.opener.closed) {
        console.log(
          "PersonioOvertimeAdjuster: Window was opened by extension, closing automatically"
        );
        window.close();
      } else {
        console.log(
          "PersonioOvertimeAdjuster: Window not opened by extension, leaving it open for user"
        );
      }
    }, 2000);
  }

  /**
   * Notifies parent window about extraction results
   */
  notifyParentWindow(extractedValue) {
    try {
      if (window.opener && !window.opener.closed) {
        console.log(
          "PersonioOvertimeAdjuster: Notifying parent window of extracted value:",
          extractedValue
        );
        window.opener.postMessage(
          {
            type: "personioCalendarExtraction",
            extractedDays: extractedValue,
          },
          "*"
        );
      } else {
        console.log(
          "PersonioOvertimeAdjuster: No parent window to notify (user opened tab manually)"
        );
      }
    } catch (error) {
      console.error(
        "PersonioOvertimeAdjuster: Error notifying parent window:",
        error
      );
    }
  }

  /**
   * Waits for an element to appear in the DOM
   */
  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const existingElement = document.querySelector(selector);
      if (existingElement) {
        resolve(existingElement);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "style"],
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // === ATTENDANCE PAGE METHODS ===

  /**
   * Starts observing the attendance page for overtime widgets
   */
  startObservingPage() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver(() => this.checkForOvertimeWidget());
    this.observer.observe(document.body, { childList: true, subtree: true });

    this.checkForOvertimeWidget();
  }

  /**
   * Stops observing the page
   */
  stopObservingPage() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Resets the extension state
   */
  resetState() {
    this.originalHours = undefined;
    this.originalMinutes = undefined;
    this.workTimePerDayInMinutes = undefined;
  }

  /**
   * Checks for overtime widget and creates input field if needed
   */
  checkForOvertimeWidget() {
    try {
      const overtimeContainer = document.querySelector(
        ".OvertimeWidget-module__confirmedTime___sa53y"
      );
      const existingInput = document.getElementById("subtractTime");

      if (overtimeContainer && !existingInput) {
        this.storeOriginalValues(overtimeContainer);
        this.createInputField();
        this.stopObservingPage();
      }
    } catch (error) {
      console.error("Error checking for overtime widget:", error);
    }
  }

  /**
   * Creates the input field and control buttons
   */
  createInputField() {
    try {
      const containers = document.querySelectorAll(
        ".Inline-module__inline___HVurB.Inline-module__none___ZcGAF.Inline-module__justify-space-between___KEJ7Y.Inline-module__align-center___uxLiG"
      );

      containers.forEach((container, index) => {
        const link = container.querySelector(
          'a[href*="/attendance/employee/"][href*="/overtime"]'
        );

        if (link && !container.querySelector("#subtractTime")) {
          this.insertInputElements(link);
        }
      });
    } catch (error) {
      console.error("Error creating input field:", error);
    }
  }

  /**
   * Creates and inserts input elements and control buttons
   */
  insertInputElements(linkElement) {
    const inputContainer = this.createInputContainer();
    const { inputElement, backButton, reloadButton, labelElement } =
      this.createControlElements();

    // Append elements to container
    inputContainer.append(inputElement, backButton, reloadButton, labelElement);

    // Insert on the next line instead of inline
    const parentContainer = linkElement.closest(
      ".Inline-module__inline___HVurB.Inline-module__none___ZcGAF.Inline-module__justify-space-between___KEJ7Y.Inline-module__align-center___uxLiG"
    );
    if (parentContainer) {
      parentContainer.insertAdjacentElement("afterend", inputContainer);
    } else {
      linkElement.insertAdjacentElement("afterend", inputContainer);
    }

    // Set up event listeners
    this.setupInputEventListeners(inputElement, backButton, reloadButton);

    // Apply initial calculation if the field has a value
    if (inputElement.value && inputElement.value !== "0") {
      this.adjustOvertime();
    }
  }

  /**
   * Creates the main input container
   */
  createInputContainer() {
    const container = document.createElement("div");
    container.style.cssText = `
            display: flex;
            gap: 2px;
            align-items: center;
        `;
    return container;
  }

  /**
   * Creates all control elements (input, buttons, label)
   */
  createControlElements() {
    // Input starts with extracted value, not persisted user input
    const extractedValue = this.getExtractedDaysOff();

    // Calculate visual adjustment for time-off days since last extraction
    const timeOffAdjustment = this.calculateTimeOffAdjustment();
    // Always compute adjusted value (including zero) so baseline matches and back button stays hidden initially
    const adjustedValue = Math.max(
      0,
      parseFloat(extractedValue || "0") - timeOffAdjustment
    ).toFixed(1);

    // Input element
    const inputElement = document.createElement("input");
    inputElement.id = "subtractTime";
    inputElement.type = "text";
    inputElement.value = adjustedValue;
    inputElement.title =
      "Enter number of granted days to subtract from overtime (use . or , for decimals)";
    inputElement.style.cssText = `
            width: 50px;
            text-align: right;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 2px 4px;
        `;

    // Back button (only show if we have extracted data and field is empty or different)
    const currentValue = inputElement.value;
    const backButton = this.createBackButton(currentValue, extractedValue);

    // Reload button
    const reloadButton = this.createReloadButton();

    // Label
    const labelElement = document.createElement("h2");
    labelElement.className = "WidgetCard-module__label___ZkWrl";
    labelElement.textContent = "planned days off";
    labelElement.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin: 0;
        `;

    // Set initial border color
    this.updateInputBorderColor(inputElement, currentValue, extractedValue);

    return { inputElement, backButton, reloadButton, labelElement };
  }

  /**
   * Creates the back button
   */
  createBackButton(currentValue, extractedValue) {
    const backButton = document.createElement("button");
    backButton.textContent = "↩";
    backButton.title = "Restore extracted future days off value";
    backButton.style.cssText = `
            margin-left: 2px;
            padding: 2px 6px;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;

    // Calculate the adjusted extracted value (extracted - time-off adjustment)
    const timeOffAdjustment = this.calculateTimeOffAdjustment();
    const adjustedExtractedValue = Math.max(
      0,
      parseFloat(extractedValue || "0") - timeOffAdjustment
    ).toFixed(1);

    // Show if current value differs (even when extracted is 0)
    const showBackButton = currentValue !== adjustedExtractedValue;
    backButton.style.display = showBackButton ? "inline-block" : "none";

    return backButton;
  }

  /**
   * Creates the reload button
   */
  createReloadButton() {
    const reloadButton = document.createElement("button");
    reloadButton.textContent = "↺";
    reloadButton.title = "Open calendar page to extract upcoming leave days";
    reloadButton.style.cssText = `
            margin-left: 2px;
            padding: 2px 6px;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;

    // Set initial border color based on extraction status
    this.updateReloadButtonBorder(reloadButton);

    return reloadButton;
  }

  /**
   * Sets up event listeners for input elements
   */
  setupInputEventListeners(inputElement, backButton, reloadButton) {
    // Input change events
    inputElement.addEventListener("input", () => this.handleInputChange());
    inputElement.addEventListener("blur", () =>
      this.validateInput(inputElement)
    );

    // Back button - restore extracted value
    backButton.addEventListener("click", () =>
      this.handleBackButtonClick(inputElement, backButton)
    );

    // Reload button - open calendar for extraction
    reloadButton.addEventListener("click", () =>
      this.handleReloadButtonClick(reloadButton)
    );
  }

  /**
   * Handles back button click to restore extracted value
   */
  handleBackButtonClick(inputElement, backButton) {
    const extractedValue = this.getExtractedDaysOff();
    if (extractedValue !== null) {
      // allow revert when extracted is 0
      // Calculate the adjusted value (same as initial display)
      const timeOffAdjustment = this.calculateTimeOffAdjustment();
      const adjustedValue = Math.max(
        0,
        parseFloat(extractedValue) - timeOffAdjustment
      ).toFixed(1);

      inputElement.value = adjustedValue;
      this.adjustOvertime();

      this.updateInputBorderColor(inputElement, adjustedValue, extractedValue);
      backButton.style.display = "none";

      const reloadButton = document.querySelector(
        'button[title*="extract upcoming leave days"], button[title*="refresh upcoming leave days"]'
      );
      if (reloadButton) {
        this.updateReloadButtonBorder(reloadButton);
      }
    }
  }

  /**
   * Handles reload button click to open calendar
   */
  handleReloadButtonClick(reloadButton) {
    const calendarUrl = this.buildCalendarUrl();
    window.open(calendarUrl, "_blank");
  }

  /**
   * Builds the calendar URL for the current company
   */
  buildCalendarUrl() {
    const urlMatch = window.location.href.match(
      /https:\/\/([^.]+)\.app\.personio\.com/
    );
    const companySubdomain = urlMatch ? urlMatch[1] : "timetoact-group";
    return `https://${companySubdomain}.app.personio.com/calendar/me/monthly?absenceTypeId=0a405db0-f811-481e-a70b-5464ce2698ec`;
  }

  // === STORAGE METHODS ===

  /**
   * Gets extracted days off from localStorage
   */
  getExtractedDaysOff() {
    try {
      return localStorage.getItem(this.extractedDaysOffKey) || "0";
    } catch (error) {
      console.error(
        "Error getting extracted days off from localStorage:",
        error
      );
      return "0";
    }
  }

  /**
   * Saves extracted days off to localStorage
   */
  saveExtractedDaysOff(value) {
    try {
      console.log(
        "PersonioOvertimeAdjuster: Attempting to save extracted days:",
        value,
        "on URL:",
        location.href
      );

      // Only save if we're on the correct extraction page or if the value is not "0"
      // This prevents overwriting valid data with "0" from wrong pages
      if (!this.isCalendarExtractionPage() && value === "0") {
        console.log(
          'PersonioOvertimeAdjuster: Prevented saving "0" on non-extraction page'
        );
        return;
      }

      localStorage.setItem(this.extractedDaysOffKey, value);
      console.log(
        "PersonioOvertimeAdjuster: Successfully saved extracted days:",
        value
      );
    } catch (error) {
      console.error(
        "PersonioOvertimeAdjuster: Error saving extracted days off to localStorage:",
        error
      );
    }
  }

  /**
   * Gets last extraction date from localStorage
   */
  getLastExtractionDate() {
    try {
      return localStorage.getItem(this.lastExtractionDateKey);
    } catch (error) {
      console.error(
        "Error getting last extraction date from localStorage:",
        error
      );
      return null;
    }
  }

  /**
   * Saves current date as last extraction date to localStorage
   */
  saveLastExtractionDate() {
    try {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      localStorage.setItem(this.lastExtractionDateKey, today);
    } catch (error) {
      console.error(
        "Error saving last extraction date to localStorage:",
        error
      );
    }
  }

  // === TIMESHEET ANALYSIS METHODS ===

  /**
   * Calculates adjustment based on time-off days since last extraction
   */
  calculateTimeOffAdjustment() {
    const lastExtractionDate = this.getLastExtractionDate();
    if (!lastExtractionDate) {
      return 0;
    }

    // Find timesheet rows
    const timesheetRows = document.querySelectorAll(
      '[data-test-id="timesheet-timecard"]'
    );
    let timeOffDaysCount = 0;

    timesheetRows.forEach((row, index) => {
      try {
        // Get ONLY the first time element with datetime in this row (which represents the date)
        const firstTimeElement = row.querySelector("time[datetime]");
        if (!firstTimeElement) {
          return;
        }

        const datetime = firstTimeElement.getAttribute("datetime");

        // Only process full date values (YYYY-MM-DD format), skip times like "06:00"
        if (!datetime || !datetime.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return;
        }

        // Add one day to the extracted date (Personio shows dates one day behind)
        const originalDate = new Date(datetime);
        const adjustedDate = new Date(originalDate);
        adjustedDate.setUTCDate(adjustedDate.getUTCDate() + 1);
        const rowDateOnly = adjustedDate.toISOString().split("T")[0];

        // Check if this date is after last extraction and before today
        const today = new Date();
        const todayDateOnly = today.toISOString().split("T")[0];

        if (rowDateOnly > lastExtractionDate && rowDateOnly < todayDateOnly) {
          // Look for the day cell container that has both date and time-off icon
          const dayCell = firstTimeElement.closest(
            ".DayCell-module__cell____HEU7"
          );
          if (!dayCell) {
            return;
          }

          const hasTimeOff = this.hasApprovedTimeOffIcon(dayCell);

          if (hasTimeOff) {
            timeOffDaysCount++;
          }
        }
      } catch (error) {
        console.error("Error processing timesheet row:", error);
      }
    });

    return timeOffDaysCount;
  }

  /**
   * Updates reload button border color based on extraction status
   */
  updateReloadButtonBorder(reloadButton) {
    const lastExtractionDate = this.getLastExtractionDate();
    const timeOffAdjustment = this.calculateTimeOffAdjustment();

    if (!lastExtractionDate) {
      // Red outline if no extraction has been done yet
      reloadButton.style.borderColor = "#dc3545";
      reloadButton.style.borderWidth = "1.5px";
      reloadButton.title =
        "No extraction done yet - Click to extract upcoming leave days";
    } else {
      const today = new Date();
      const extractionDate = new Date(lastExtractionDate);
      const daysDifference = Math.floor(
        (today - extractionDate) / (1000 * 60 * 60 * 24)
      );

      if (daysDifference > 30) {
        // Red outline if last extraction was more than a month ago
        reloadButton.style.borderColor = "#dc3545";
        reloadButton.style.borderWidth = "1.5px";
        reloadButton.title = `Last extraction was ${daysDifference} days ago - Click to refresh upcoming leave days`;
      } else if (timeOffAdjustment > 0) {
        // Yellow outline if there has been a subtraction
        reloadButton.style.borderColor = "#ffc107";
        reloadButton.style.borderWidth = "1.5px";
        reloadButton.title = `${timeOffAdjustment} day(s) subtracted since last extraction - Click to refresh upcoming leave days`;
      } else {
        // Default border
        reloadButton.style.borderColor = "#ccc";
        reloadButton.style.borderWidth = "1px";
        reloadButton.title =
          "Open calendar page to extract upcoming leave days";
      }
    }
  }

  /**
   * Checks if a day cell has an approved time-off icon
   */
  hasApprovedTimeOffIcon(dayCell) {
    // Look for the specific time-off icon structure within the day cell
    const timeOffIcon = dayCell.querySelector('[data-test-id="time-off-icon"]');
    if (!timeOffIcon) {
      return false;
    }

    // Check for the green circle indicating approved time-off
    const greenCircle = timeOffIcon.querySelector(
      ".TimeOffIcon-module__circle___a1qx6.TimeOffIcon-module__green___L77Rd"
    );
    if (greenCircle) {
      return true;
    }

    // Also check for any circle as fallback for testing
    const anyCircle = timeOffIcon.querySelector(
      ".TimeOffIcon-module__circle___a1qx6"
    );
    if (anyCircle) {
      return true;
    }

    return false;
  }

  // === INPUT HANDLING METHODS ===

  /**
   * Handles input field changes
   */
  handleInputChange() {
    const inputElement = document.getElementById("subtractTime");
    if (!inputElement) return;

    this.adjustOvertime();

    // Update border color and back button visibility
    const extractedValue = this.getExtractedDaysOff();
    this.updateInputBorderColor(
      inputElement,
      inputElement.value,
      extractedValue
    );
    this.updateBackButtonVisibility(inputElement.value, extractedValue);

    // Update reload button border color based on current adjustment
    const reloadButton = document.querySelector(
      'button[title*="extract upcoming leave days"], button[title*="refresh upcoming leave days"]'
    );
    if (reloadButton) {
      this.updateReloadButtonBorder(reloadButton);
    }
  }

  /**
   * Updates back button visibility based on value match
   */
  updateBackButtonVisibility(userValue, extractedValue) {
    const backButton = document.querySelector(
      'button[title="Restore extracted future days off value"]'
    );
    if (backButton) {
      // Calculate the adjusted extracted value (extracted - time-off adjustment)
      const timeOffAdjustment = this.calculateTimeOffAdjustment();
      const adjustedExtractedValue = Math.max(
        0,
        parseFloat(extractedValue || "0") - timeOffAdjustment
      ).toFixed(1);

      // Show if different (even when extracted is 0)
      const showBackButton = userValue !== adjustedExtractedValue;
      backButton.style.display = showBackButton ? "inline-block" : "none";
    }
  }

  /**
   * Updates input border color based on value matching
   */
  updateInputBorderColor(inputElement, userValue, extractedValue) {
    // Calculate the adjusted extracted value for proper comparison
    const timeOffAdjustment = this.calculateTimeOffAdjustment();
    const adjustedExtractedValue = Math.max(
      0,
      parseFloat(extractedValue || "0") - timeOffAdjustment
    ).toFixed(1);
    if (
      userValue === adjustedExtractedValue &&
      extractedValue !== null &&
      extractedValue !== undefined &&
      extractedValue !== ""
    ) {
      // Green border when values match the adjusted extracted value
      inputElement.style.borderColor = "#28a745";
      inputElement.style.borderWidth = "2px";
    } else {
      // Default border
      inputElement.style.borderColor = "#ccc";
      inputElement.style.borderWidth = "1px";
    }
  }

  /**
   * Validates input field value
   */
  validateInput(inputElement) {
    const value = inputElement.value.replace(",", ".");

    if (value && isNaN(parseFloat(value))) {
      inputElement.style.borderColor = "#ff6b6b";
      inputElement.style.borderWidth = "2px";
      inputElement.title = "Please enter a valid number";
    } else {
      inputElement.title =
        "Enter number of granted days to subtract from overtime (use . or , for decimals)";

      // Restore proper border color
      const extractedValue = this.getExtractedDaysOff();
      this.updateInputBorderColor(inputElement, value, extractedValue);
    }
  }

  /**
   * Checks if a value is a valid number
   */
  isValidNumber(value) {
    return (
      value !== "" && !isNaN(parseFloat(value)) && isFinite(parseFloat(value))
    );
  }

  // === OVERTIME CALCULATION METHODS ===

  /**
   * Adjusts overtime display based on input value
   */
  adjustOvertime() {
    try {
      const inputElement = document.getElementById("subtractTime");
      if (!inputElement) return;

      const inputValue = inputElement.value.replace(",", ".");

      // Ensure work time per day is calculated
      if (this.workTimePerDayInMinutes === undefined) {
        this.setWorkTimePerDay();
      }

      // Calculate minutes to subtract
      let valueToSubtractInMinutes = 0;
      if (
        inputValue &&
        inputValue !== "0" &&
        this.isValidNumber(inputValue) &&
        this.workTimePerDayInMinutes !== undefined
      ) {
        valueToSubtractInMinutes =
          parseFloat(inputValue) * this.workTimePerDayInMinutes;
      }

      this.updateOvertimeDisplay(valueToSubtractInMinutes);
    } catch (error) {
      console.error("Error adjusting overtime:", error);
    }
  }

  /**
   * Updates the overtime display with adjusted values
   */
  updateOvertimeDisplay(valueToSubtractInMinutes) {
    const overtimeContainer = document.querySelector(
      ".OvertimeWidget-module__confirmedTime___sa53y"
    );
    if (!overtimeContainer) return;

    // Ensure original values are stored
    if (
      this.originalHours === undefined ||
      this.originalMinutes === undefined
    ) {
      this.storeOriginalValues(overtimeContainer);
    }

    // Calculate adjusted time
    const totalOriginalMinutes = this.originalHours * 60 + this.originalMinutes;
    const adjustedTotalMinutes =
      totalOriginalMinutes - valueToSubtractInMinutes;

    const formattedTime = this.formatTimeDisplay(adjustedTotalMinutes);

    // Remove any existing wrapper div
    const existingWrapper = overtimeContainer.querySelector(
      ".overtime-display-wrapper"
    );
    if (existingWrapper) {
      existingWrapper.remove();
    }

    // Create wrapper div that contains both adjusted and original time
    const wrapperDiv = document.createElement("div");
    wrapperDiv.className = "overtime-display-wrapper";
    wrapperDiv.style.cssText = "display: inline;";

    // Clear the original container and put content in wrapper
    overtimeContainer.innerHTML = "";

    // Add adjusted time
    const adjustedSpan = document.createElement("span");
    adjustedSpan.textContent = formattedTime;
    wrapperDiv.appendChild(adjustedSpan);

    // Add original value if there's an adjustment
    if (valueToSubtractInMinutes > 0) {
      const originalFormattedTime =
        this.formatTimeDisplay(totalOriginalMinutes);
      const originalDisplay = document.createElement("span");
      originalDisplay.className = "original-overtime-display";
      originalDisplay.textContent = ` (was ${originalFormattedTime})`;
      originalDisplay.style.cssText = `
                font-size: 0.5em;
                color: #888;
                margin-left: 3px;
            `;
      wrapperDiv.appendChild(originalDisplay);
    }

    // Insert wrapper inside overtime container
    overtimeContainer.appendChild(wrapperDiv);

    // Apply color coding to the adjusted time span
    this.applyOvertimeColorCoding(adjustedSpan, adjustedTotalMinutes);
  }

  /**
   * Formats time display in Personio's format
   */
  formatTimeDisplay(totalMinutes) {
    const isNegative = totalMinutes < 0;
    const absoluteMinutes = Math.abs(totalMinutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const minutes = Math.round(absoluteMinutes % 60);

    const sign = isNegative ? "-" : "";

    if (hours > 0 && minutes > 0) {
      return `${sign}${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${sign}${hours}h`;
    } else if (minutes > 0) {
      return `${sign}${minutes}m`;
    } else {
      return "0h";
    }
  }

  /**
   * Applies color coding to overtime display
   */
  applyOvertimeColorCoding(container, totalMinutes) {
    if (totalMinutes > 0) {
      container.style.color = "#28a745"; // Green for positive
    } else if (totalMinutes < 0) {
      container.style.color = "#dc3545"; // Red for negative
    } else {
      container.style.color = "#6c757d"; // Gray for zero
    }
  }

  /**
   * Stores original overtime values from the display
   */
  storeOriginalValues(overtimeContainer) {
    try {
      const timeText = overtimeContainer.textContent.trim();

      // Parse Personio's format: "7h 42m", "-7h 42m", "7h", "42m", "0h", etc.
      const timeRegex = /^(-?)(?:(\d+)h)?\s*(?:(\d+)m)?$/;
      const match = timeText.match(timeRegex);

      if (match) {
        const isNegative = match[1] === "-";
        const hours = parseInt(match[2] || "0", 10);
        const minutes = parseInt(match[3] || "0", 10);

        this.originalHours = isNegative ? -hours : hours;
        this.originalMinutes = isNegative ? -minutes : minutes;
      } else {
        // Fallback for old format "+40:04" or "-7:42"
        const fallbackRegex = /([+-]?)(\d+):(\d+)/;
        const fallbackMatch = timeText.match(fallbackRegex);

        if (fallbackMatch) {
          const sign = fallbackMatch[1] === "-" ? -1 : 1;
          const hours = parseInt(fallbackMatch[2], 10);
          const minutes = parseInt(fallbackMatch[3], 10);

          this.originalHours = hours * sign;
          this.originalMinutes = minutes * sign;
        } else {
          this.originalHours = 0;
          this.originalMinutes = 0;
        }
      }
    } catch (error) {
      console.error("Error storing original values:", error);
      this.originalHours = 0;
      this.originalMinutes = 0;
    }
  }

  /**
   * Calculates work time per day based on weekly schedule
   */
  setWorkTimePerDay() {
    try {
      const weeklyWorkTimeContainer = document.querySelector(
        ".WorkingScheduleWidget-module__weeklyHours___IfLge"
      );
      if (!weeklyWorkTimeContainer) {
        this.workTimePerDayInMinutes = this.STANDARD_WORKDAY_MINUTES;
        return;
      }

      const weeklyWorkTimeText = weeklyWorkTimeContainer.textContent;
      const weeklyWorkTime = weeklyWorkTimeText.split("/")[0].split(" ");

      const weeklyWorkTimeHours = parseInt(weeklyWorkTime[0], 10) || 0;
      const weeklyWorkTimeMinutes = parseInt(weeklyWorkTime[1], 10) || 0;
      const totalWeeklyWorkTime =
        weeklyWorkTimeHours * 60 + weeklyWorkTimeMinutes;

      // Get number of work days per week
      const workdays = document.querySelectorAll(
        '.WorkingScheduleWidget-module__day___wI1eK[data-state="work"]'
      );
      const numberOfWorkdaysPerWeek = workdays.length;

      if (numberOfWorkdaysPerWeek > 0) {
        this.workTimePerDayInMinutes =
          totalWeeklyWorkTime / numberOfWorkdaysPerWeek;
      } else {
        this.workTimePerDayInMinutes = this.STANDARD_WORKDAY_MINUTES;
      }
    } catch (error) {
      console.error("Error calculating work time per day:", error);
      this.workTimePerDayInMinutes = this.STANDARD_WORKDAY_MINUTES;
    }
  }

  // === CALENDAR EXTRACTION METHODS ===

  /**
   * Extracts absence data from calendar page
   */
  extractCalendarAbsenceData(doc) {
    try {
      let totalDays = 0;

      // Primary method: target new BalanceTab structure in dialog
      // Look for the active balance tab content first
      const balanceTabContent = doc.querySelector(
        '[id*="content-balance"][data-state="active"]'
      );
      if (balanceTabContent) {
        const balanceContainer = balanceTabContent.querySelector(
          ".BalanceTab-module__visuallyGroupedBalanceStatements___lyShZ"
        );
        if (balanceContainer) {
          totalDays = this.extractFromBalanceTabContainer(balanceContainer);

          if (totalDays > 0) {
            const totalMinutes = totalDays * this.STANDARD_WORKDAY_MINUTES;
            return totalMinutes;
          }
        }
      }

      // Fallback: Look for balance container anywhere on the page
      const balanceContainer = doc.querySelector(
        ".BalanceTab-module__visuallyGroupedBalanceStatements___lyShZ"
      );

      if (balanceContainer) {
        totalDays = this.extractFromBalanceTabContainer(balanceContainer);

        if (totalDays > 0) {
          const totalMinutes = totalDays * this.STANDARD_WORKDAY_MINUTES;
          return totalMinutes;
        }
      }

      // Fallback method: old Stack container
      const stackContainer = doc.querySelector(
        ".Stack-module__1EcFT-8V__v0-6-8.Stack-module__y3QoKyTs__v0-6-8"
      );

      if (stackContainer) {
        totalDays = this.extractFromStackContainer(stackContainer);

        if (totalDays > 0) {
          const totalMinutes = totalDays * this.STANDARD_WORKDAY_MINUTES;
          return totalMinutes;
        }
      }

      // Fallback method: broader search
      totalDays = this.extractFromFallbackMethod(doc);

      if (totalDays > 0) {
        const totalMinutes = totalDays * this.STANDARD_WORKDAY_MINUTES;
        return totalMinutes;
      }

      return null;
    } catch (error) {
      console.error("Error extracting calendar absence data:", error);
      return null;
    }
  }

  /**
   * Extracts days from the new BalanceTab structure
   */
  extractFromBalanceTabContainer(balanceContainer) {
    let totalDays = 0;

    try {
      console.log(
        "PersonioOvertimeAdjuster: Found balance container, extracting data..."
      );

      // Get all balance statements
      const balanceStatements = balanceContainer.querySelectorAll(
        ".BalanceTab-module__balanceStatement___PKh3f"
      );

      console.log(
        "PersonioOvertimeAdjuster: Found",
        balanceStatements.length,
        "balance statements"
      );

      balanceStatements.forEach((statement, index) => {
        // Look for the tooltip content to identify the type
        const tooltipContent = statement.querySelector(
          ".BalanceTab-module__tooltipContent___Ose3o"
        );

        if (tooltipContent) {
          const tooltipText = tooltipContent.textContent.trim();
          console.log(
            "PersonioOvertimeAdjuster: Statement",
            index,
            "type:",
            tooltipText
          );

          if (tooltipText === "Planned (approved)") {
            // Found the "Planned (approved)" section
            const dayValueSpan = statement.querySelector("p span");

            if (dayValueSpan) {
              let dayValue = this.extractDaysFromText(dayValueSpan.textContent);
              console.log(
                "PersonioOvertimeAdjuster: Extracted base days:",
                dayValue,
                "from text:",
                dayValueSpan.textContent
              );

              // Check for additional future periods text
              const additionalText = statement.querySelector(
                ".InlineAlert-module__inlineAlert___TrYZg span"
              );
              if (
                additionalText &&
                additionalText.textContent.includes("Not including")
              ) {
                console.log(
                  "PersonioOvertimeAdjuster: Found additional text:",
                  additionalText.textContent
                );
                const futureMatch = additionalText.textContent.match(
                  /Not including (\d+(?:[.,]\d+)?)\s*(?:day|days)/i
                );
                if (futureMatch) {
                  const futureDays = parseFloat(
                    futureMatch[1].replace(",", ".")
                  );
                  console.log(
                    "PersonioOvertimeAdjuster: Adding future days:",
                    futureDays
                  );
                  dayValue += futureDays;
                }
              }

              totalDays += dayValue;
              console.log(
                "PersonioOvertimeAdjuster: Total days so far:",
                totalDays
              );
            }
          }
        }
      });

      console.log(
        "PersonioOvertimeAdjuster: Final extracted total:",
        totalDays
      );
    } catch (error) {
      console.error(
        "PersonioOvertimeAdjuster: Error extracting from BalanceTab container:",
        error
      );
    }

    return totalDays;
  }

  /**
   * Extracts days from the main stack container
   */
  extractFromStackContainer(stackContainer) {
    let totalDays = 0;

    const inlineContainers = stackContainer.querySelectorAll(
      ".Inline-module__bXbkibKw__v0-6-8.Inline-module__XTSrxcwj__v0-6-8.Inline-module__UEtVxQKs__v0-6-8.Inline-module__uD5yQygQ__v0-6-8"
    );

    inlineContainers.forEach((container, index) => {
      // Skip first entry (taken days)
      if (index === 0) return;

      const days = this.extractDaysFromContainer(container, index);
      if (days > 0) {
        totalDays += days;
      }
    });

    return totalDays;
  }

  /**
   * Extracts days from fallback method
   */
  extractFromFallbackMethod(doc) {
    let totalDays = 0;
    const allContainers = doc.querySelectorAll("dt, dd");

    let foundEntries = [];
    for (let i = 0; i < allContainers.length; i += 2) {
      const dt = allContainers[i];
      const dd = allContainers[i + 1];

      if (dt && dd && dt.tagName === "DT" && dd.tagName === "DD") {
        foundEntries.push({
          label: dt.textContent.trim(),
          value: dd.textContent.trim(),
        });
      }
    }

    // Skip first entry and extract from remaining
    for (let i = 1; i < foundEntries.length; i++) {
      const days = this.extractDaysFromText(foundEntries[i].value);
      if (days > 0) {
        totalDays += days;
      }
    }

    return totalDays;
  }

  /**
   * Extracts days from a single container
   */
  extractDaysFromContainer(container, index) {
    try {
      const dt = container.querySelector("dt");
      const dd = container.querySelector("dd");

      if (!dt || !dd) return 0;

      const labelSpan = dt.querySelector(
        ".BaseTypography-module__JG0dB-pS__v6-3-8"
      );
      const valueSpan = dd.querySelector(
        ".BaseTypography-module__JG0dB-pS__v6-3-8"
      );

      if (!labelSpan || !valueSpan) return 0;

      const label = labelSpan.textContent.trim();
      const value = valueSpan.textContent.trim();

      return this.extractDaysFromText(value);
    } catch (error) {
      console.error("Error extracting days from container:", error);
      return 0;
    }
  }

  /**
   * Extracts numerical days from text
   */
  extractDaysFromText(text) {
    // Try the new format first: "5d", "14.5d", etc.
    let daysMatch = text.match(/(\d+(?:[.,]\d+)?)\s*d\b/i);
    if (daysMatch) {
      return parseFloat(daysMatch[1].replace(",", "."));
    }

    // Fallback to old format: "5 Tage", "5 Days", etc.
    daysMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:Tage?|Days?|Tag|Day)/i);
    if (daysMatch) {
      return parseFloat(daysMatch[1].replace(",", "."));
    }

    return 0;
  }

  // === CLEANUP METHODS ===

  /**
   * Cleanup method for extension shutdown
   */
  destroy() {
    this.stopObservingPage();
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
    }
    window.removeEventListener("popstate", this.handleUrlChange);
  }
}

// Initialize the extension
const personioAdjuster = new PersonioOvertimeAdjuster();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (window.personioAdjuster) {
    window.personioAdjuster.destroy();
  }
});

// Make it globally accessible for debugging
window.personioAdjuster = personioAdjuster;
