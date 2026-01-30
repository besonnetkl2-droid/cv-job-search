# Bug Fixes Applied (Jan 27)

## Issues Fixed

### 1. **Stacking Bug in Load & Import Functions** ✅
**Problem**: When clicking "Load Profile" multiple times, experience/education/skills entries were duplicated.

**Root Cause**: 
- Code was setting `state.experience = payload.experience` (from stored data)
- Then immediately calling `state.experience.forEach((item) => newExpCard(item))`
- But `newExpCard()` internally does `state.experience.push(data)`, adding MORE items
- So each load click appended items instead of replacing them

**Fix Applied**:
```javascript
// WRONG (was duplicating):
state.experience = payload.experience || [];
state.experience.forEach((item) => newExpCard(item));  // <- newExpCard() ADDS to array!

// CORRECT (now):
state.experience = [];  // Clear first
state.education = [];
state.skills = [];
(payload.experience || []).forEach((item) => newExpCard(item));  // Loop payload, not state
(payload.education || []).forEach((item) => newEduCard(item));
(payload.skills || []).forEach(addSkillChip);
```

**Applied to**:
- `loadFromLocalStorage()` function (line ~150)
- `importVault()` function (line ~225)

---

### 2. **Save Workflow Unclear** ✅
**Problem**: User entered PIN but didn't know if/when data was being saved.

**What Happened**: 
- Autosave only triggers on INPUT change (when you type in a field)
- Just entering a PIN alone doesn't trigger autosave (PIN input is `@input` event but doesn't fire save logic immediately)
- User was confused about when data actually got saved

**Fixes Applied**:

1. **Added "Save Now" button** in HTML
   - New button: `<button id="saveNowBtn" class="ghost small">💾 Save Now</button>`
   - Allows manual save without waiting for autosave debounce

2. **Clarified PIN behavior**:
   - When PIN is set correctly (4+ chars): status shows "Autosave enabled"
   - Manually enter PIN → triggers `queueSave()` (800ms debounce)
   - Button provides immediate save if user doesn't want to wait

3. **Updated status messages**:
   - Initial: "Ready (enter PIN to enable autosave)"
   - When PIN invalid: "PIN must be at least 4 characters"
   - When PIN valid: "Autosave enabled"
   - When Save clicked: "Saving..." → "Auto-saved (encrypted)"

4. **Added event listeners** for new buttons:
   ```javascript
   document.getElementById("saveNowBtn").addEventListener("click", () => {
     if (!pinValue || pinValue.length < 4) {
       setStatus("Set PIN (min 4 chars) to save");
       return;
     }
     clearTimeout(saveTimer);
     saveToLocalStorage();
   });

   document.getElementById("loadBtn").addEventListener("click", loadFromLocalStorage);
   ```

---

### 3. **Updated UI Buttons** ✅
**Changes**:
- Old: Import + Export only
- New: Save Now + Load Profile + Import + Export (all with emoji for clarity)

```html
<button id="saveNowBtn" class="ghost small">💾 Save Now</button>
<button id="loadBtn" class="ghost small">📂 Load Profile</button>
<button id="importBtn" class="ghost small">📥 Import</button>
<button id="exportBtn" class="ghost small">📤 Export</button>
```

---

## Files Modified
- `/prod/index.html` - Added Save Now + Load buttons
- `/prod/static/app.js` - Fixed stacking bug + added event listeners + updated messages

## Testing Steps

1. **Enter sample data**: Page loads with "Alex Rivera" sample
2. **Set a PIN**: Enter 4+ chars → status shows "Autosave enabled"
3. **Edit a field**: Type in any field → waits 800ms, auto-saves → status "Auto-saved (encrypted)"
4. **Click "Save Now"**: Immediately saves (no wait) → status "Auto-saved (encrypted)"
5. **Modify data**: Add experience, edit fields
6. **Click "Load Profile"**: Data reloads → NO STACKING (each click loads cleanly, no duplication)
7. **Click "Export"**: Downloads `.vault` file (encrypted)
8. **Click "Import"**: Select `.vault` file → imports without stacking
9. **Generate PDF**: Still works, exports to `cv.pdf`

## Data Retrieval (Your Earlier Question)

**Your Question**: "can you retrieve my earlier inputs?"

**Answer**: 
- If you had just entered a PIN but not explicitly saved, data wasn't in localStorage yet
- Now with these fixes, it should work:
  1. **Enter PIN** (4+ chars) → triggers autosave in 800ms
  2. **Wait a moment** or click **💾 Save Now** to save immediately
  3. **Refresh page** or **close & reopen**
  4. **Enter same PIN**
  5. **Click 📂 Load Profile** → Your data reloads without stacking

- **First time usage**: Sample data auto-saves when you set PIN. You can modify it and it stays.
- **If no vault exists**: "No saved profile found" message appears.

## Encryption Details
- **Algorithm**: AES-GCM (256-bit keys)
- **Key Derivation**: PBKDF2 with 200,000 iterations (SHA-256)
- **Storage**: localStorage key = `cv_vault_encrypted` (encrypted blob)
- **Export format**: `.vault` file (encrypted, portable, can import on different device with same PIN)

---

**Status**: All bugs fixed. Workflow clarified. Ready to use! 🎉
