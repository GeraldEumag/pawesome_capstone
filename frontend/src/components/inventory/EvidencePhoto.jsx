import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload, faTimes, faImage } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi, inventoryEvidenceUrl } from "../../api/inventory.jsx";
import { getSecureFileUrl } from "../../utils/secureFileAccess";
import { showAlert } from "../../utils/alert";

const MAX_MB = 4;
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Evidence photo picker — validates type/size client-side, uploads to the
 * private evidence endpoint, and reports the stored path via onChange.
 * The file is NOT attached to the stock-out/return request itself; the path
 * is sent in the `photo` field afterwards.
 */
export const EvidenceUpload = ({ value, onChange, label = "Photo evidence" }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      showAlert({ icon: "error", title: "Invalid file", text: "Only JPG, PNG or WebP images are allowed." });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      showAlert({ icon: "error", title: "File too large", text: `Maximum size is ${MAX_MB} MB.` });
      return;
    }
    setUploading(true);
    try {
      const res = await inventoryApi.uploadEvidence(file);
      setPreview(URL.createObjectURL(file));
      onChange?.(res?.path || null);
    } catch (err) {
      showAlert({ icon: "error", title: "Upload failed", text: err.message || "Could not upload the photo." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="sm-evidence">
      <span className="pw-label">{label}</span>
      <div className="sm-evidence-row">
        <label className="sm-evidence-btn">
          <FontAwesomeIcon icon={faUpload} />
          {uploading ? "Uploading…" : value ? "Replace photo" : "Attach photo"}
          <input type="file" accept={ACCEPT} onChange={handleFile} disabled={uploading} hidden />
        </label>
        {value && (
          <button type="button" className="sm-evidence-remove" onClick={() => { setPreview(null); onChange?.(null); }}>
            <FontAwesomeIcon icon={faTimes} /> Remove
          </button>
        )}
      </div>
      {preview && <img src={preview} alt="Evidence preview" className="sm-evidence-thumb" />}
      {value && !preview && <EvidenceImage photo={value} />}
    </div>
  );
};

/**
 * Renders a stored evidence photo. Uploads live on the private disk and are
 * fetched through the authenticated evidence endpoint as a blob; legacy
 * free-text references render as plain text.
 */
export const EvidenceImage = ({ photo }) => {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const url = inventoryEvidenceUrl(photo);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!url) return undefined;
    getSecureFileUrl(url)
      .then((blob) => { if (alive) setSrc(blob); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);

  if (!photo) return null;
  if (!url) return <span className="sm-evidence-ref" title={photo}>Ref: {photo}</span>;
  if (failed) return <span className="sm-evidence-ref"><FontAwesomeIcon icon={faImage} /> Photo unavailable</span>;
  if (!src) return <span className="sm-evidence-ref">Loading photo…</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="Evidence" className="sm-evidence-thumb" />
    </a>
  );
};

export default EvidenceUpload;
