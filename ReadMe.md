# Personio Planned Overtime Tracker

Automatically adjusts your Personio overtime balance by subtracting your **planned days off**, giving you a more **realistic overview** of your remaining overtime.

---

## Introduction

The **Personio Planned Overtime Tracker** helps you see your true overtime by automatically accounting for your upcoming approved leave days.

It works directly within your Personio attendance page and updates your overtime display instantly.

---

## Installation Guide

### **Firefox (or Firefox-based browsers)**

1.  Execute the `.xpi` file using your preferred browser.
2.  Confirm the installation when prompted.

### **Google Chrome (or Chrome-based browsers)**

1.  Unzip **PersonioPlannedOvertimeTracker.zip**.
2.  Open Chrome and go to `chrome://extensions`.
    - Or click **Extensions → Manage Extensions**.
3.  Enable **Developer Mode** (toggle in the top-right corner).
4.  Click **Load unpacked**.
5.  Select the unzipped extension folder.

---

## How to Use

1.  **Open your Personio attendance page**

    - Navigate to your attendance - overtime view in Personio.
    - You’ll see a small `planned days off` input below the overtime widget, with two buttons: `⟳` and `↩`.

2.  **Extract your upcoming leave days**

    - Click `⟳` to fetch your upcoming approved leave days from your Personio calendar.
    - A new tab briefly opens and closes automatically.
    - The input field fills with the number of upcoming leave days (decimals supported, e.g., `1.5`).

3.  **See your adjusted overtime instantly**

    - Your overtime display updates automatically, subtracting the entered days.
    - The original value remains visible in parentheses.

4.  **Manually tweak if needed**

    - You can manually enter any number in the `planned days off` input.
    - Decimals are supported (`0.5` or `0,5`).

5.  **Revert to the last extracted value**
    - If you change the input, the `↩` button appears.
    - Click it to restore the last extracted value (it accounts for days off already taken since the last extraction).

---

## 🔘 Buttons Explained

### **Extract (`⟳`)**

Fetches your upcoming approved leave days and fills the input field.

**Border color hints:**

- 🟢 **Green** – Up to date
- 🔴 **Red** – Never extracted or outdated — click to refresh
- 🟠 **Orange** – Some leave taken since last extraction — click to refresh

### **Revert `↩`**

Appears when your current input differs from the last extracted value.  
 Click to reset the input to the previously extracted number.

---

## Notes

- The adjusted overtime is for **display purposes only**.
- It **does not** alter any actual data in Personio.

---

## 🐞 Bug Reports

Any bug, issue, or improvement can be reported to **armin.schneider@timetoact.at**.
