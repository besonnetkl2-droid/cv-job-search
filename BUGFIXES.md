# CV Studio Bug Fixes (Jan 28, 2026)

## Issues Fixed

### 1. ❌ "jobs.forEach is not a function" → 0 results

**Root Cause**: The job search API returns an object with structure:
```json
{
  "status": "success",
  "total_jobs": 45,
  "high_match": 12,
  "jobs": [...]  // Array we need
}
```

But the JavaScript was trying to call `.forEach()` directly on this object, not on the `jobs` array inside it.

**Fix**: Extract the `jobs` array from the response:
```javascript
// BEFORE (broken)
const jobs = await res.json();  // This is an object
jobs.forEach(...)  // ERROR: jobs.forEach is not a function

// AFTER (fixed)
const data = await res.json();
const jobs = data.jobs || [];  // Extract array
jobs.forEach(...)  // Works!
```

**Location**: `static/app.js`, line ~495

---

### 2. 🔄 Skills duplicate when closing and reopening a CV

**Root Cause**: Two-fold issue:
1. When loading a file, the code called `state.skills.forEach(addSkillChip)` 
2. `addSkillChip()` function pushed the skill to `state.skills` AGAIN
3. So each skill was pushed twice, then rendered twice

**Fix**: 
- Clear state arrays **before** reloading from profile
- Build UI directly instead of calling `addSkillChip()` during load
- Add safety check in `addSkillChip()` to prevent duplicate additions

```javascript
// BEFORE (broken)
state.skills = [...(profile.skills || [])];
state.skills.forEach(addSkillChip);  // addSkillChip also pushes to state!

// AFTER (fixed)
// Clear first
state.skills = [];

// Reload from profile
state.skills = [...(profile.skills || [])];

// Build UI directly (don't use addSkillChip which would push again)
state.skills.forEach(skill => {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerText = skill;
  document.getElementById("skillsList").appendChild(chip);
});
```

**Location**: `static/app.js`, lines 130-165

---

### 3. 💾 Data persistence after reboot

**Status**: ✅ Working as designed

**Explanation**: 
- All CV data is saved to encrypted files in `.secure/` directory on the backend
- Auto-save triggers 1 second after you stop typing (debounced)
- The "Saved ✓" status indicator shows when data is persisted
- **Why data might appear lost**: If you don't wait for "Saved ✓" before closing the app, recent edits won't be saved

**Recommendation**: 
- Wait for "Saved ✓" status before closing the app
- Or click back to files view to force a save before navigating away
- Data persists server-side, not in browser storage

**Storage Location**: 
```
.secure/[first_12_chars_of_pin_hash]/cv_[timestamp].json (encrypted)
```

---

## Testing Checklist

- [ ] Add skills to CV, close and reopen → no duplication
- [ ] Click "Find Jobs" with skills in profile → loads 10+ results
- [ ] Job results show match percentage and titles
- [ ] Click "Letter" button → generates motivation letter in new window
- [ ] Close app, reopen → your CVs are still there with all data intact
- [ ] Save status updates as you edit

## Files Modified

- `static/app.js` - Fixed job search response parsing, skill duplication, and file loading logic

