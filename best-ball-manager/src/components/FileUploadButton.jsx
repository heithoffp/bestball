import React, { useRef, useState, useCallback } from 'react';

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function FileUploadButton({ label, onUpload }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await readFileAsText(file);
      await onUpload(text, file.name);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [onUpload]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="toolbar-btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Loading...' : label}
      </button>
    </>
  );
}
