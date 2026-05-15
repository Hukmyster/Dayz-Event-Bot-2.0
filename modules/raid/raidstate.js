const state = {
  uploadedFiles: [],
  candidates: [],
  confirmed: [],
  falseFlags: []
};

function getUploadedFiles() {
  return [...state.uploadedFiles];
}

function setUploadedFiles(files) {
  state.uploadedFiles = Array.isArray(files) ? [...files] : [];
}

function pushCandidates(items) {
  if (!Array.isArray(items)) return;
  state.candidates.push(...items);
}

function pushConfirmed(items) {
  if (!Array.isArray(items)) return;
  state.confirmed.push(...items);
}

function pushFalseFlags(items) {
  if (!Array.isArray(items)) return;
  state.falseFlags.push(...items);
}

function getState() {
  return {
    uploadedFiles: [...state.uploadedFiles],
    candidates: [...state.candidates],
    confirmed: [...state.confirmed],
    falseFlags: [...state.falseFlags]
  };
}

function reset() {
  state.uploadedFiles = [];
  state.candidates = [];
  state.confirmed = [];
  state.falseFlags = [];
}

module.exports = {
  state,
  getUploadedFiles,
  setUploadedFiles,
  pushCandidates,
  pushConfirmed,
  pushFalseFlags,
  getState,
  reset
};
