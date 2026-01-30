const state = {
  experience: [],
  education: [],
  skills: [],
  photo: null,
};

let pinValue = "";
let saveTimer = null;
let isLocked = false;
const saveStatus = document.getElementById("saveStatus");

const experienceList = document.getElementById("experienceList");
const educationList = document.getElementById("educationList");
const skillsList = document.getElementById("skillsList");
const cvCanvas = document.getElementById("cvCanvas");

const STORAGE_KEY = "cv_vault_encrypted";
const SALT_LEN = 16;
const IV_LEN = 12;

function setStatus(msg) {
  if (!saveStatus) return;
  saveStatus.innerText = msg;
}

// ============ Web Crypto (Client-side AES-GCM) ============

async function deriveKey(pin, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 200000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return window.crypto.subtle.importKey("raw", keyBits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptData(pin, data) {
  if (!pin || pin.length < 4) throw new Error("PIN must be at least 4 chars");
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(pin, salt);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    plaintext
  );
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(pin, encrypted) {
  if (!pin || pin.length < 4) throw new Error("PIN must be at least 4 chars");
  const combined = new Uint8Array(atob(encrypted).split("").map((c) => c.charCodeAt(0)));
  const salt = combined.slice(0, SALT_LEN);
  const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = combined.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(pin, salt);
  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}

// ============ Auto-save to localStorage ============

async function saveToLocalStorage() {
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN to enable autosave");
    return;
  }
  setStatus("Saving...";
  const payload = {
    name: document.getElementById("name").value,
    title: document.getElementById("title").value,
    summary: document.getElementById("summary").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    location: document.getElementById("location").value,
    website: document.getElementById("website").value,
    experience: state.experience,
    education: state.education,
    skills: state.skills,
    photo: state.photo,
    layout: Array.from(document.querySelectorAll("#layoutTabs button"))
      .find((b) => b.classList.contains("active"))?.dataset.layout || "modern",
  };
  try {
    const encrypted = await encryptData(pinValue, payload);
    localStorage.setItem(STORAGE_KEY, encrypted);
    setStatus("Auto-saved (encrypted)");
  } catch (err) {
    setStatus("Save failed: " + err.message);
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN (min 4 chars) to enable autosave");
    return;
  }
  saveTimer = setTimeout(saveToLocalStorage, 800);
}

async function loadFromLocalStorage() {
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN to load data");
    return;
  }
  setStatus("Loading...";
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (!encrypted) {
    setStatus("No saved profile found");
    return;
  }
  try {
    const payload = await decryptData(pinValue, encrypted);
    document.getElementById("name").value = payload.name || "";
    document.getElementById("title").value = payload.title || "";
    document.getElementById("summary").value = payload.summary || "";
    document.getElementById("email").value = payload.email || "";
    document.getElementById("phone").value = payload.phone || "";
    document.getElementById("location").value = payload.location || "";
    document.getElementById("website").value = payload.website || "";

    state.photo = payload.photo || null;

    // CRITICAL: Clear DOM AND state arrays first
    experienceList.innerHTML = "";
    educationList.innerHTML = "";
    skillsList.innerHTML = "";
    state.experience = [];
    state.education = [];
    state.skills = [];

    // Now rebuild state from payload (NOT state which is empty)
    (payload.experience || []).forEach((item) => newExpCard(item));
    (payload.education || []).forEach((item) => newEduCard(item));
    (payload.skills || []).forEach(addSkillChip);

    const layout = payload.layout || "modern";
    Array.from(document.querySelectorAll("#layoutTabs button")).forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === layout);
    });
    switchLayout(layout);

    renderPreview();
    setStatus("Loaded successfully");
  } catch (err) {
    setStatus("Load failed: invalid PIN or corrupt data");
  }
}

// ============ Export/Import vault file ============

async function exportVault() {
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN to export");
    return;
  }
  setStatus("Exporting...";
  try {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) {
      setStatus("No saved profile to export");
      return;
    }
    const blob = new Blob([encrypted], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv_vault_${new Date().toISOString().slice(0, 10)}.vault`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Vault exported");
  } catch (err) {
    setStatus("Export failed: " + err.message);
  }
}

async function importVault() {
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN to import");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".vault";
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Importing...";
    try {
      const text = await file.text();
      const payload = await decryptData(pinValue, text);
      document.getElementById("name").value = payload.name || "";
      document.getElementById("title").value = payload.title || "";
      document.getElementById("summary").value = payload.summary || "";
      document.getElementById("email").value = payload.email || "";
      document.getElementById("phone").value = payload.phone || "";
      document.getElementById("location").value = payload.location || "";
      document.getElementById("website").value = payload.website || "";

      state.photo = payload.photo || null;

      // CRITICAL: Clear DOM AND state arrays first
      experienceList.innerHTML = "";
      educationList.innerHTML = "";
      skillsList.innerHTML = "";
      state.experience = [];
      state.education = [];
      state.skills = [];

      // Now rebuild from payload
      (payload.experience || []).forEach((item) => newExpCard(item));
      (payload.education || []).forEach((item) => newEduCard(item));
      (payload.skills || []).forEach(addSkillChip);

      const layout = payload.layout || "modern";
      Array.from(document.querySelectorAll("#layoutTabs button")).forEach((b) => {
        b.classList.toggle("active", b.dataset.layout === layout);
      });
      switchLayout(layout);

      renderPreview();
      localStorage.setItem(STORAGE_KEY, text);
      setStatus("Imported and saved");
    } catch (err) {
      setStatus("Import failed: " + err.message);
    }
  };
  input.click();
}

// ============ CV rendering ============

function renderPreview() {
  document.getElementById("cvName").innerText = document.getElementById("name").value || "Your Name";
  document.getElementById("cvTitle").innerText = document.getElementById("title").value || "Your Title";
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;
  const location = document.getElementById("location").value;
  const pieces = [email, phone, location].filter(Boolean);
  document.getElementById("cvMeta").innerText = pieces.join(" • ") || "Contact details";
  document.getElementById("cvWebsite").innerText = document.getElementById("website").value || "";
  document.getElementById("cvSummary").innerText = document.getElementById("summary").value || "";

  const expHolder = document.getElementById("cvExperience");
  expHolder.innerHTML = "";
  state.experience.forEach((item) => {
    const wrap = document.createElement("div");
    wrap.className = "exp-item";
    wrap.innerHTML = `
      <div class="exp-title">${item.role || "Role"} @ ${item.company || "Company"}</div>
      <div class="exp-meta">${item.period || "Period"}</div>
      <div class="exp-bullets">${item.summary || ""}</div>
    `;
    expHolder.appendChild(wrap);
  });

  const eduHolder = document.getElementById("cvEducation");
  eduHolder.innerHTML = "";
  state.education.forEach((item) => {
    const wrap = document.createElement("div");
    wrap.className = "edu-item";
    wrap.innerHTML = `
      <div class="edu-title">${item.school || "School"} — ${item.degree || "Degree"}</div>
      <div class="edu-meta">${item.period || "Period"}</div>
    `;
    eduHolder.appendChild(wrap);
  });

  const skillHolder = document.getElementById("cvSkills");
  skillHolder.innerHTML = "";
  state.skills.forEach((s) => {
    const chip = document.createElement("div");
    chip.className = "skill-pill";
    chip.innerText = s;
    skillHolder.appendChild(chip);
  });

  const photo = document.getElementById("photoPreview");
  photo.style.backgroundImage = state.photo ? `url(${state.photo})` : "";

  queueSave();
}

function newExpCard(data = {}) {
  const card = document.createElement("div");
  card.className = "card";
  const idx = state.experience.length;
  state.experience.push({ role: data.role || "", company: data.company || "", period: data.period || "", summary: data.summary || "" });
  card.innerHTML = `
    <div class="grid two">
      <label>Role<input data-field="role" data-type="exp" data-idx="${idx}" value="${data.role || ""}"></label>
      <label>Company<input data-field="company" data-type="exp" data-idx="${idx}" value="${data.company || ""}"></label>
    </div>
    <label>Period<input data-field="period" data-type="exp" data-idx="${idx}" value="${data.period || ""}"></label>
    <label>Highlights<textarea rows="2" data-field="summary" data-type="exp" data-idx="${idx}">${data.summary || ""}</textarea></label>
  `;
  experienceList.appendChild(card);
}

function newEduCard(data = {}) {
  const card = document.createElement("div");
  card.className = "card";
  const idx = state.education.length;
  state.education.push({ school: data.school || "", degree: data.degree || "", period: data.period || "" });
  card.innerHTML = `
    <div class="grid two">
      <label>School<input data-field="school" data-type="edu" data-idx="${idx}" value="${data.school || ""}"></label>
      <label>Degree<input data-field="degree" data-type="edu" data-idx="${idx}" value="${data.degree || ""}"></label>
    </div>
    <label>Period<input data-field="period" data-type="edu" data-idx="${idx}" value="${data.period || ""}"></label>
  `;
  educationList.appendChild(card);
}

function addSkillChip(value = "") {
  if (!value) return;
  state.skills.push(value);
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerText = value;
  skillsList.appendChild(chip);
}

function loadSample() {
  document.getElementById("name").value = "Alex Rivera";
  document.getElementById("title").value = "Senior Product Designer";
  document.getElementById("summary").value = "Designs resilient products that balance clarity, accessibility, and measurable outcomes.";
  document.getElementById("email").value = "alex@example.com";
  document.getElementById("phone").value = "+49 170 123456";
  document.getElementById("location").value = "Berlin, Germany";
  document.getElementById("website").value = "https://alex.design";

  experienceList.innerHTML = "";
  educationList.innerHTML = "";
  skillsList.innerHTML = "";
  state.experience = [];
  state.education = [];
  state.skills = [];

  newExpCard({ role: "Lead Product Designer", company: "Northwind", period: "2022–Present", summary: "Led redesign increasing activation by 18%." });
  newExpCard({ role: "Product Designer", company: "Contoso", period: "2019–2022", summary: "Shipped design system used across 14 squads." });
  newEduCard({ school: "FH Potsdam", degree: "B.A. Interface Design", period: "2014–2017" });
  ["Figma", "Design Systems", "User Research", "Prototyping", "Accessibility", "Motion"].forEach(addSkillChip);
  renderPreview();
}

function handleInput(e) {
  const target = e.target;
  const type = target.dataset.type;
  const field = target.dataset.field;
  const idx = Number(target.dataset.idx);
  if (!field) {
    renderPreview();
    return;
  }
  if (type === "exp") {
    state.experience[idx][field] = target.value;
  } else if (type === "edu") {
    state.education[idx][field] = target.value;
  }
  renderPreview();
}

document.addEventListener("input", handleInput);
document.getElementById("sampleBtn").addEventListener("click", loadSample);
document.getElementById("addExp").addEventListener("click", () => {
  newExpCard();
  renderPreview();
});
document.getElementById("addEdu").addEventListener("click", () => {
  newEduCard();
  renderPreview();
});
document.getElementById("addSkill").addEventListener("click", () => {
  const val = prompt("Skill name?");
  if (val) {
    addSkillChip(val.trim());
    renderPreview();
  }
});

document.getElementById("photoInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.photo = reader.result;
    renderPreview();
  };
  reader.readAsDataURL(file);
});

function switchLayout(layout) {
  cvCanvas.classList.remove("modern", "sidebar", "minimal");
  cvCanvas.classList.add(layout);
}

Array.from(document.querySelectorAll("#layoutTabs button")).forEach((btn) => {
  btn.addEventListener("click", () => {
    Array.from(document.querySelectorAll("#layoutTabs button")).forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    switchLayout(btn.dataset.layout);
    queueSave();
  });
});

async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const canvas = await html2canvas(cvCanvas, { scale: 2, backgroundColor: "#0b0d12" });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const imgWidth = canvas.width * ratio;
  const imgHeight = canvas.height * ratio;
  const x = (pageWidth - imgWidth) / 2;
  const y = 20;
  pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
  pdf.save("cv.pdf");
}

document.getElementById("pdfBtn").addEventListener("click", generatePDF);

document.getElementById("saveNowBtn").addEventListener("click", () => {
  if (!pinValue || pinValue.length < 4) {
    setStatus("Set PIN (min 4 chars) to save");
    return;
  }
  clearTimeout(saveTimer);
  saveToLocalStorage();
});

document.getElementById("loadBtn").addEventListener("click", loadFromLocalStorage);

document.getElementById("pinInput").addEventListener("input", async (e) => {
  pinValue = e.target.value.trim();
  if (pinValue.length < 4) {
    setStatus("PIN must be at least 4 characters");
    return;
  }
  
  // If locked and has saved data, try to auto-unlock
  if (isLocked && localStorage.getItem(STORAGE_KEY)) {
    try {
      await loadFromLocalStorage();
      unlockUI();
      setStatus("Unlocked - autosave enabled");
    } catch (err) {
      setStatus("Wrong PIN - try again");
      pinValue = "";
      document.getElementById("pinInput").value = "";
    }
  } else {
    setStatus("Autosave enabled");
    queueSave();
  }
});

document.getElementById("importBtn").addEventListener("click", importVault);
document.getElementById("exportBtn").addEventListener("click", exportVault);

function lockUI() {
  isLocked = true;
  document.querySelector(".form-panel").style.opacity = "0.3";
  document.querySelector(".form-panel").style.pointerEvents = "none";
  document.querySelector(".preview-panel").style.opacity = "0.3";
  document.getElementById("sampleBtn").style.display = "none";
  document.getElementById("saveNowBtn").style.display = "none";
  document.getElementById("loadBtn").style.display = "none";
  document.getElementById("pinInput").focus();
}

function unlockUI() {
  isLocked = false;
  document.querySelector(".form-panel").style.opacity = "1";
  document.querySelector(".form-panel").style.pointerEvents = "auto";
  document.querySelector(".preview-panel").style.opacity = "1";
  document.getElementById("sampleBtn").style.display = "inline-block";
  document.getElementById("saveNowBtn").style.display = "inline-block";
  document.getElementById("loadBtn").style.display = "inline-block";
}

// Check if saved data exists on load
const hasSavedData = !!localStorage.getItem(STORAGE_KEY);
if (hasSavedData) {
  lockUI();
  setStatus("🔒 Locked - enter PIN to unlock and view your data");
  renderPreview(); // Render empty preview
} else {
  unlockUI();
  setStatus("No saved data - set PIN and start creating");
  renderPreview();
}
