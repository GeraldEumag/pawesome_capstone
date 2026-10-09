import { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faSpinner, faImage, faPlus, faTrash, faGlobe, faHome, faPaw, faInfoCircle, faRectangleAd, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { fetchAdminLandingPageSections, updateLandingPageSection, uploadLandingPageImage } from "../../api/landingPage";
import { clearLandingPageCache } from "../../hooks/useLandingPageContent";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./AdminLandingPageEditor.css";

const SECTIONS = [
  { key: "hero", label: "Hero", icon: faHome },
  { key: "featured_services", label: "Services", icon: faPaw },
  { key: "about", label: "Why Pawesome", icon: faInfoCircle },
  { key: "footer", label: "Contact & Footer", icon: faRectangleAd },
  { key: "auth_pages", label: "Account Page Images", icon: faImage },
];

const SERVICE_DEFAULTS = [
  { key: "hotel", title: "Pet Hotel", description: "Comfortable boarding while you are away.", cta: "Book Hotel", icon: "hotel" },
  { key: "grooming", title: "Grooming", description: "Professional grooming and hygiene care.", cta: "Book Grooming", icon: "grooming" },
  { key: "vet", title: "Veterinary Services", description: "Veterinary consultations and preventive care.", cta: "Book Vet Visit", icon: "vet" },
];

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const AdminLandingPageEditor = () => {
  const [sections, setSections] = useState({});
  const [activeSection, setActiveSection] = useState("hero");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Track which sections have unsaved changes
  const [dirtySections, setDirtySections] = useState(new Set());
  // Snapshot of last-saved state per section for dirty comparison
  const savedSnapshotRef = useRef({});

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminLandingPageSections();
      if (res.success && res.data) {
        const map = {};
        res.data.forEach((item) => {
          map[item.section_key] = item.content_data;
        });
        setSections(map);
        // Snapshot loaded state — no dirty sections after fresh load
        savedSnapshotRef.current = JSON.parse(JSON.stringify(map));
        setDirtySections(new Set());
      } else {
        setError(res.message || "Failed to load sections.");
      }
    } catch (err) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const handleChange = (path, value) => {
    const section = path.split(".")[0];
    setSections((prev) => {
      const next = deepClone(prev);
      const keys = path.split(".");
      let target = next;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;

      // Mark section dirty if different from saved snapshot
      const savedStr = JSON.stringify(savedSnapshotRef.current[section] ?? {});
      const nextStr = JSON.stringify(next[section] ?? {});
      setDirtySections((prev) => {
        const updated = new Set(prev);
        if (savedStr !== nextStr) {
          updated.add(section);
        } else {
          updated.delete(section);
        }
        return updated;
      });

      return next;
    });
  };

  const handleSave = async () => {
    const data = sections[activeSection];
    if (!data) return;
    setSaving(true);
    try {
      const res = await updateLandingPageSection(activeSection, data);
      if (res.success) {
        clearLandingPageCache();
        // Update snapshot for this section and clear dirty flag
        savedSnapshotRef.current[activeSection] = JSON.parse(JSON.stringify(data));
        setDirtySections((prev) => {
          const updated = new Set(prev);
          updated.delete(activeSection);
          return updated;
        });
        showSuccess("Section saved successfully.");
      } else {
        showError(res.message || "Failed to save.");
      }
    } catch (err) {
      showError(err.message || "Network error.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e, fieldPath) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadLandingPageImage(file, activeSection);
      if (res.success && res.data?.url) {
        handleChange(fieldPath, res.data.url);
        showSuccess("Image uploaded.");
      } else {
        showError(res.message || "Upload failed.");
      }
    } catch (err) {
      showError(err.message || "Upload error.");
    } finally {
      setUploading(false);
    }
  };

  const renderInput = (label, path, type = "text", placeholder = "") => {
    const currentValue = path.split(".").reduce((o, k) => o?.[k], sections) || "";
    const displayPlaceholder = placeholder || currentValue || "";
    return (
      <label className="editor-field">
        <span>{label}</span>
        {type === "textarea" ? (
          <textarea
            value={currentValue}
            onChange={(e) => handleChange(path, e.target.value)}
            placeholder={displayPlaceholder}
            rows={3}
          />
        ) : (
          <input
            type={type}
            value={currentValue}
            onChange={(e) => handleChange(path, e.target.value)}
            placeholder={displayPlaceholder}
          />
        )}
      </label>
    );
  };

  const renderImageField = (label, path) => {
    const value = path.split(".").reduce((o, k) => o?.[k], sections) || "";
    return (
      <label className="editor-field">
        <span>{label}</span>
        <div className="editor-image-row">
          {value && <img src={value} alt="Preview" className="editor-image-preview" />}
          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, path)} />
          {uploading && <FontAwesomeIcon icon={faSpinner} spin />}
        </div>
      </label>
    );
  };

  const renderArrayField = (label, path, fields, maxItems = Infinity) => {
    const items = path.split(".").reduce((o, k) => o?.[k], sections) || [];
    return (
      <div className="editor-array">
        <div className="editor-array-header">
          <strong>{label}</strong>
          <button
            type="button"
            className="editor-btn-small"
            disabled={items.length >= maxItems}
            onClick={() => {
              const newItem = {};
              fields.forEach((f) => (newItem[f.key] = f.default || ""));
              handleChange(path, [...items, newItem]);
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> Add
          </button>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="editor-array-item">
            {fields.map((field) => (
              <input
                key={field.key}
                type="text"
                placeholder={field.label}
                value={item[field.key] || ""}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], [field.key]: e.target.value };
                  handleChange(path, next);
                }}
              />
            ))}
            <button
              type="button"
              className="editor-btn-remove"
              onClick={() => {
                const next = items.filter((_, i) => i !== idx);
                handleChange(path, next);
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderEditor = () => {
    const data = sections[activeSection];
    if (!data) return <p>Select a section to edit.</p>;
    const serviceItems = SERVICE_DEFAULTS.map((defaults) => ({
      ...defaults,
      ...(data.services || []).find((service) => service.key === defaults.key),
    }));

    switch (activeSection) {
      case "hero":
        return (
          <div className="editor-form">
            {renderInput("Eyebrow (optional)", "hero.eyebrow")}
            {renderInput("Main heading", "hero.headline")}
            {renderInput("Short description", "hero.description", "textarea")}
            {renderInput("Primary button label", "hero.primary_cta")}
            {renderImageField("Hero photo", "hero.image")}
            <p className="editor-helper-text">Use one clear, high-quality photo. Leave it unchanged to use the default facility image.</p>
          </div>
        );
      case "featured_services":
        return (
          <div className="editor-form">
            {renderInput("Eyebrow (optional)", "featured_services.eyebrow")}
            {renderInput("Section heading", "featured_services.headline")}
            {renderInput("Short introduction", "featured_services.description", "textarea")}
            <div className="editor-array">
              <strong>Core services</strong>
              {serviceItems.map((svc, idx) => (
                <div key={`${svc.key}-${idx}`} className="editor-service-card">
                  <label className="editor-field">
                    <span>Service</span>
                    <select
                      value={svc.key || ""}
                      onChange={(e) => {
                        const next = serviceItems.map((item, itemIndex) => itemIndex === idx ? { ...item, key: e.target.value } : item);
                        handleChange("featured_services.services", next);
                      }}
                    >
                      <option value="hotel" disabled={serviceItems.some((item, i) => i !== idx && item.key === "hotel")}>Pet Hotel</option>
                      <option value="grooming" disabled={serviceItems.some((item, i) => i !== idx && item.key === "grooming")}>Grooming</option>
                      <option value="vet" disabled={serviceItems.some((item, i) => i !== idx && item.key === "vet")}>Veterinary</option>
                    </select>
                  </label>
                  <input
                    aria-label="Service card title"
                    placeholder="Card title"
                    value={svc.title || ""}
                    onChange={(e) => {
                      const next = serviceItems.map((item, itemIndex) => itemIndex === idx ? { ...item, title: e.target.value } : item);
                      handleChange("featured_services.services", next);
                    }}
                  />
                  <textarea
                    aria-label="Service card description"
                    placeholder="Short service description"
                    value={svc.description || ""}
                    onChange={(e) => {
                      const next = serviceItems.map((item, itemIndex) => itemIndex === idx ? { ...item, description: e.target.value } : item);
                      handleChange("featured_services.services", next);
                    }}
                    rows={2}
                  />
                  <input
                    aria-label="Service button label"
                    placeholder="Button label"
                    value={svc.cta || ""}
                    onChange={(e) => {
                      const next = serviceItems.map((item, itemIndex) => itemIndex === idx ? { ...item, cta: e.target.value } : item);
                      handleChange("featured_services.services", next);
                    }}
                  />
                  <div className="editor-image-row">
                    {svc.image && <img src={svc.image} alt="Service card preview" className="editor-image-preview" />}
                    <label className="editor-facility-upload">
                      <span>{svc.image ? "Change photo" : "Add photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleImageUpload(event, `featured_services.services.${idx}.image`)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case "about":
        return (
          <div className="editor-form">
            {renderInput("Eyebrow (optional)", "about.eyebrow")}
            {renderInput("Section heading", "about.headline")}
            {renderInput("Short description", "about.description", "textarea")}
            {renderImageField("Facility photo", "about.image")}
            {renderArrayField("Highlights (up to 3)", "about.points", [
              { key: "title", label: "Highlight title", default: "" },
              { key: "description", label: "Short explanation", default: "" },
            ], 3)}
          </div>
        );
      case "footer":
        return (
          <div className="editor-form">
            {renderInput("Business name (shown in footer + copyright)", "footer.brand_name")}
            {renderInput("Tagline (below business name)", "footer.tagline")}
            {renderInput("Short description paragraph", "footer.description", "textarea")}
            {renderInput("Contact phone number", "footer.phone")}
            {renderInput("Contact email", "footer.email")}
            {renderInput("Contact address", "footer.address", "textarea")}
          </div>
        );
      case "auth_pages":
        return (
          <div className="editor-form">
            <p className="editor-helper-text">
              These photos are used on the sign-in and registration pages, not on the public landing page.
            </p>
            {renderImageField("Login page background photo", "auth_pages.login_bg_image")}
            {renderImageField("Registration page background photo", "auth_pages.register_bg_image")}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="admin-landing-editor">
      <div className="admin-landing-editor-header">
        <div>
          <h1>
            <FontAwesomeIcon icon={faGlobe} /> Landing Page Editor
          </h1>
          <p>Edit text, images, and buttons for the public landing page.</p>
        </div>
        <button
          type="button"
          className="editor-preview-btn"
          title="Open the currently saved public landing page in a new tab"
          onClick={() => window.open("/", "_blank")}
        >
          <FontAwesomeIcon icon={faExternalLinkAlt} />
          Preview Landing Page
        </button>
      </div>

      <div className="admin-landing-editor-body">
        <aside className="admin-landing-editor-sidebar">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              className={`${activeSection === section.key ? "active" : ""}${dirtySections.has(section.key) ? " dirty" : ""}`}
              onClick={() => setActiveSection(section.key)}
            >
              <FontAwesomeIcon icon={section.icon} />
              {section.label}
              {dirtySections.has(section.key) && (
                <span className="editor-dirty-dot" title="Unsaved changes" />
              )}
            </button>
          ))}
        </aside>

        <main className="admin-landing-editor-main">
          {loading ? (
            <div className="editor-loading">
              <FontAwesomeIcon icon={faSpinner} spin /> Loading...
            </div>
          ) : error ? (
            <div className="editor-error">{error}</div>
          ) : (
            <>
              <div className="editor-section-title">
                <h2>
                  {SECTIONS.find((s) => s.key === activeSection)?.label}
                  {dirtySections.has(activeSection) && (
                    <span className="editor-unsaved-badge">Unsaved changes</span>
                  )}
                </h2>
                <button
                  className="editor-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
              {renderEditor()}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminLandingPageEditor;
