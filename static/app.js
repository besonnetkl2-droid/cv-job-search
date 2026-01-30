// STATE
const state = {
  experience: [],
  education: [],
  skills: [],
  photo: null,
};

let currentFileId = null;
let saveTimer = null;

// VIEWS
function showView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(viewName).classList.add("active");
}

// ============ VIEW 1: LOGIN ============

document.getElementById("pinInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const pin = document.getElementById("pinInput").value.trim();
  if (!pin || pin.length < 4) {
    document.getElementById("loginError").innerText = "PIN must be at least 4 characters";
    return;
  }
  
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    
    if (!res.ok) throw new Error("Invalid PIN");
    
    const data = await res.json();
    showView("filesView");
    renderFilesList(data.files);
    document.getElementById("pinInput").value = "";
  } catch (err) {
    document.getElementById("loginError").innerText = `Error: ${err.message}`;
  }
});

// ============ VIEW 2: FILE MANAGER ============

async function renderFilesList(files) {
  const list = document.getElementById("filesList");
  list.innerHTML = "";
  
  if (files.length === 0) {
    list.innerHTML = "<p style='color:#999;'>No CVs yet. Create one to get started.</p>";
    return;
  }
  
  files.forEach(file => {
    const item = document.createElement("div");
    item.className = "file-item";
    const modified = new Date(file.modified).toLocaleDateString();
    item.innerHTML = `
      <div class="file-info" onclick="openFile('${file.id}')">
        <div class="file-name">${file.name}</div>
        <div class="file-meta">Modified: ${modified}</div>
      </div>
      <div class="file-actions">
        <button onclick="deleteFile('${file.id}')" class="small ghost">🗑️</button>
      </div>
    `;
    list.appendChild(item);
  });
}

document.getElementById("newFileBtn").addEventListener("click", async () => {
  const name = prompt("CV name:", "My CV");
  if (!name) return;
  
  try {
    const res = await fetch("/api/files/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    
    if (!res.ok) throw new Error("Failed to create");
    const data = await res.json();
    openFile(data.fileId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

async function deleteFile(fileId) {
  if (!confirm("Delete this CV? This cannot be undone.")) return;
  
  try {
    const res = await fetch(`/api/files/${fileId}/delete`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to delete");
    
    // Refresh list
    const filesRes = await fetch("/api/files");
    const filesData = await filesRes.json();
    renderFilesList(filesData.files);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  showView("loginView");
});

// ============ VIEW 3: CV EDITOR ============

async function openFile(fileId) {
  try {
    const res = await fetch(`/api/files/${fileId}/open`);
    if (!res.ok) throw new Error("Failed to open file");
    
    const data = await res.json();
    const profile = data.data;
    
    currentFileId = fileId;
    
    // Load into editor
    document.getElementById("name").value = profile.name || "";
    document.getElementById("title").value = profile.title || "";
    document.getElementById("summary").value = profile.summary || "";
    document.getElementById("email").value = profile.email || "";
    document.getElementById("phone").value = profile.phone || "";
    document.getElementById("location").value = profile.location || "";
    document.getElementById("website").value = profile.website || "";
    
    document.getElementById("fileName").innerText = profile._meta?.name || "Untitled";
    
    // CRITICAL: Clear UI first
    document.getElementById("experienceList").innerHTML = "";
    document.getElementById("educationList").innerHTML = "";
    document.getElementById("skillsList").innerHTML = "";
    
    // CRITICAL: Clear state arrays BEFORE reloading to prevent duplication
    state.experience = [];
    state.education = [];
    state.skills = [];
    
    // NOW reload from profile
    state.experience = [...(profile.experience || [])];
    state.education = [...(profile.education || [])];
    state.skills = [...(profile.skills || [])];
    state.photo = profile.photo || null;
    
    // Rebuild UI cards
    state.experience.forEach(item => newExpCard(item));
    state.education.forEach(item => newEduCard(item));
    state.skills.forEach(skill => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerText = skill;
      document.getElementById("skillsList").appendChild(chip);
    });
    
    if (state.photo) {
      document.getElementById("photoPreview").style.backgroundImage = `url(${state.photo})`;
    }
    
    renderPreview();
    showView("editorView");
    setStatus("Loaded - start editing");
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

document.getElementById("backBtn").addEventListener("click", async () => {
  if (currentFileId) {
    await saveFile();
  }
  showView("filesView");
  const res = await fetch("/api/files");
  const data = await res.json();
  renderFilesList(data.files);
});

document.getElementById("renameFileBtn").addEventListener("click", async () => {
  const newName = prompt("New name:", document.getElementById("fileName").innerText);
  if (!newName) return;
  
  try {
    const res = await fetch(`/api/files/${currentFileId}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    
    if (!res.ok) throw new Error("Failed to rename");
    document.getElementById("fileName").innerText = newName;
    setStatus("Renamed");
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

document.getElementById("deleteFileBtn").addEventListener("click", async () => {
  if (!confirm("Delete this CV? This cannot be undone.")) return;
  
  try {
    await fetch(`/api/files/${currentFileId}/delete`, { method: "POST" });
    document.getElementById("backBtn").click();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

[document.getElementById("logoutBtn2")].forEach(btn => {
  btn.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    showView("loginView");
  });
});

// ============ CV EDITOR LOGIC ============

function setStatus(msg) {
  document.getElementById("saveStatus").innerText = msg;
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveFile, 1000);
}

async function saveFile() {
  if (!currentFileId) return;
  
  setStatus("Saving...");
  
  const payload = {
    _meta: {
      name: document.getElementById("fileName").innerText,
      modified: new Date().toISOString(),
    },
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
  };
  
  try {
    const res = await fetch(`/api/files/${currentFileId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: payload }),
    });
    
    if (!res.ok) throw new Error("Save failed");
    setStatus("Saved ✓");
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

// Input listeners
document.querySelectorAll("#name, #title, #summary, #email, #phone, #location, #website").forEach(input => {
  input.addEventListener("input", () => {
    renderPreview();
    queueSave();
  });
});

// ============ CV RENDERING ============

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
  document.getElementById("experienceList").appendChild(card);
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
  document.getElementById("educationList").appendChild(card);
}

function addSkillChip(value = "") {
  if (!value) return;
  // Only add to state if not already present (prevent duplication on reload)
  if (!state.skills.includes(value)) {
    state.skills.push(value);
  }
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerText = value;
  document.getElementById("skillsList").appendChild(chip);
}

// Add item buttons
document.getElementById("addExp").addEventListener("click", () => {
  newExpCard();
  renderPreview();
  queueSave();
});

document.getElementById("addEdu").addEventListener("click", () => {
  newEduCard();
  renderPreview();
  queueSave();
});

document.getElementById("addSkill").addEventListener("click", () => {
  const val = prompt("Skill name?");
  if (val) {
    addSkillChip(val.trim());
    renderPreview();
    queueSave();
  }
});

// Input handler for repeatable items
document.addEventListener("input", (e) => {
  const target = e.target;
  const type = target.dataset.type;
  const field = target.dataset.field;
  const idx = Number(target.dataset.idx);
  
  if (!field) return;
  
  if (type === "exp") {
    state.experience[idx][field] = target.value;
  } else if (type === "edu") {
    state.education[idx][field] = target.value;
  }
  
  renderPreview();
  queueSave();
});

// Photo upload
document.getElementById("photoInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.photo = reader.result;
    renderPreview();
    queueSave();
  };
  reader.readAsDataURL(file);
});

// Layout tabs
Array.from(document.querySelectorAll("#layoutTabs button")).forEach((btn) => {
  btn.addEventListener("click", () => {
    Array.from(document.querySelectorAll("#layoutTabs button")).forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const cvCanvas = document.getElementById("cvCanvas");
    cvCanvas.classList.remove("modern", "sidebar", "minimal");
    cvCanvas.classList.add(btn.dataset.layout);
    queueSave();
  });
});

// PDF export
document.getElementById("pdfBtn").addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  const cvCanvas = document.getElementById("cvCanvas");
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
  pdf.save(`${document.getElementById("fileName").innerText || "cv"}.pdf`);
});

setStatus("Ready");
// ============ JOB SEARCH ============

function openJobSearch() {
  document.getElementById("jobSearchPanel").style.display = "block";
}

function closeJobSearch() {
  document.getElementById("jobSearchPanel").style.display = "none";
}

document.getElementById("searchJobsBtn")?.addEventListener("click", async () => {
  if (state.skills.length === 0) {
    alert("Please add skills to your profile first");
    return;
  }
  
  const location = document.getElementById("jobLocation").value;
  const statusDiv = document.getElementById("jobSearchStatus");
  const resultsDiv = document.getElementById("jobSearchResults");
  
  statusDiv.innerText = "🔍 Searching 100+ positions...";
  resultsDiv.innerHTML = "";
  
  try {
    const res = await fetch("/api/jobs/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skills: state.skills,
        location: location,
        limit: 100
      })
    });
    
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    const jobs = data.jobs || [];
    
    statusDiv.innerText = `✅ Found ${jobs.length} matching positions`;
    displayJobResults(jobs);
  } catch (err) {
    statusDiv.innerText = `❌ Error: ${err.message}`;
  }
});

function displayJobResults(jobs) {
  const resultsDiv = document.getElementById("jobSearchResults");
  resultsDiv.innerHTML = "";
  
  if (jobs.length === 0) {
    resultsDiv.innerHTML = "<p style='color:#9fb4d1;'>No matching jobs found.</p>";
    return;
  }
  
  jobs.forEach((job, idx) => {
    const matchPercent = Math.round(job.match_score * 100);
    const item = document.createElement("div");
    item.className = "job-item";
    item.innerHTML = `
      <div class="job-item-title">${job.title}</div>
      <div class="job-item-company">${job.company} • ${job.location}</div>
      <div class="job-item-score">Match: ${matchPercent}%</div>
      <div class="job-item-actions">
        <button onclick="viewJobDetail('${job.id}', '${idx}')">View</button>
        <button onclick="generateJobLetter('${job.id}')">Letter</button>
        <button onclick="openJobLink('${job.url}')">Apply</button>
      </div>
    `;
    resultsDiv.appendChild(item);
  });
}

function openJobLink(url) {
  window.open(url, "_blank");
}

async function generateJobLetter(jobId) {
  const statusDiv = document.getElementById("jobSearchStatus");
  statusDiv.innerText = "✍️ Generating motivation letter...";
  
  try {
    const res = await fetch(`/api/jobs/${jobId}/motivation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("name").value,
        skills: state.skills
      })
    });
    
    if (!res.ok) throw new Error("Failed to generate letter");
    const data = await res.json();
    
    // Display letter in modal or new window
    const letterWindow = window.open("", "", "width=800,height=600");
    letterWindow.document.write(`
      <html>
        <head>
          <style>
            body { font-family: 'Times New Roman', serif; line-height: 1.6; max-width: 800px; margin: 40px; }
            p { text-align: justify; margin: 12px 0; }
            .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; }
          </style>
        </head>
        <body>
          ${data.letter.replace(/\n/g, '<br>')}
          <div class="footer">
            <p><strong>Tip:</strong> Customize this letter with specific examples and achievements before sending.</p>
            <button onclick="window.print()">Print/Save as PDF</button>
            <button onclick="window.close()">Close</button>
          </div>
        </body>
      </html>
    `);
    letterWindow.document.close();
    
    statusDiv.innerText = "✅ Letter generated!";
  } catch (err) {
    statusDiv.innerText = `❌ Error: ${err.message}`;
  }
}