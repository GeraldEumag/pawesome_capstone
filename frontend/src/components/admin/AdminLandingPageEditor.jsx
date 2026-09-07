import { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faSpinner, faImage, faPlus, faTrash, faGlobe, faEye, faHome, faPaw, faListOl, faInfoCircle, faBullhorn, faChartBar, faImages, faRectangleAd, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { fetchAdminLandingPageSections, updateLandingPageSection, uploadLandingPageImage } from "../../api/landingPage";
import { clearLandingPageCache } from "../../hooks/useLandingPageContent";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./AdminLandingPageEditor.css";

const SECTIONS = [
  { key: "hero", label: "Top Banner", icon: faHome },
  { key: "featured_services", label: "Service Cards", icon: faPaw },
  { key: "how_it_works", label: "How It Works", icon: faListOl },
  { key: "about", label: "About Us", icon: faInfoCircle },
  { key: "final_cta", label: "Bottom Banner", icon: faBullhorn },
  { key: "trust_stats", label: "Quick Stats", icon: faChartBar },
  { key: "facilities_gallery", label: "Facilities Gallery", icon: faImages },
  { key: "footer", label: "Footer", icon: faRectangleAd },
  { key: "auth_pages", label: "Auth Page Photos", icon: faImage },
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

  const handleFacilityImageUpload = async (e, itemIdx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadLandingPageImage(file, "facilities_gallery");
      if (res.success && res.data?.url) {
        setSections((prev) => {
          const next = deepClone(prev);
          const items = next.facilities_gallery?.items || [];
          if (items[itemIdx]) items[itemIdx].image = res.data.url;
          return next;
        });
        showSuccess("Photo uploaded.");
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

  const renderArrayField = (label, path, fields) => {
    const items = path.split(".").reduce((o, k) => o?.[k], sections) || [];
    return (
      <div className="editor-array">
        <div className="editor-array-header">
          <strong>{label}</strong>
          <button
            type="button"
            className="editor-btn-small"
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

    switch (activeSection) {
      case "hero":
        return (
          <div className="editor-form">
            {renderInput("Small top text (appears above the big title)", "hero.eyebrow")}
            {renderInput("Big title / Main heading", "hero.headline")}
            {renderInput("Description paragraph", "hero.description", "textarea")}
            {renderInput("Main button text", "hero.primary_cta")}
            {renderInput("Second button text", "hero.secondary_cta")}
            <p className="editor-helper-text">
              The three images below appear as a photo mosaic on the right side of the hero banner. Each slot falls back to a default facility photo if left empty.
            </p>
            {renderImageField("Hero mosaic photo — Slot 1 (main / left)", "hero.image")}
            {renderImageField("Hero mosaic photo — Slot 2 (top-right)", "hero.image_2")}
            {renderImageField("Hero mosaic photo — Slot 3 (bottom-right)", "hero.image_3")}
            <div className="editor-array">
              <div className="editor-array-header">
                <strong>Topic labels (small badges under buttons)</strong>
                <button
                  type="button"
                  className="editor-btn-small"
                  onClick={() => handleChange("hero.tags", [...(sections.hero?.tags || []), ""])}
                >
                  <FontAwesomeIcon icon={faPlus} /> Add
                </button>
              </div>
              {(sections.hero?.tags || []).map((tag, idx) => (
                <div key={idx} className="editor-array-item">
                  <input
                    type="text"
                    placeholder="Badge label (e.g., Pet Hotel)"
                    value={typeof tag === "string" ? tag : tag?.value || ""}
                    onChange={(e) => {
                      const next = [...(sections.hero?.tags || [])];
                      next[idx] = e.target.value;
                      handleChange("hero.tags", next);
                    }}
                  />
                  <button
                    type="button"
                    className="editor-btn-remove"
                    onClick={() => {
                      const next = (sections.hero?.tags || []).filter((_, i) => i !== idx);
                      handleChange("hero.tags", next);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case "featured_services":
        return (
          <div className="editor-form">
            {renderInput("Small top text (above the section title)", "featured_services.eyebrow")}
            {renderInput("Section title", "featured_services.headline")}
            {renderInput("Section description", "featured_services.description", "textarea")}
            <div className="editor-array">
              <strong>Service cards (max 3 recommended)</strong>
              {(data.services || []).map((svc, idx) => (
                <div key={idx} className="editor-service-card">
                  <input
                    placeholder="Service type: hotel, grooming, or vet"
                    value={svc.key || ""}
                    onChange={(e) => {
                      const next = [...data.services];
                      next[idx] = { ...next[idx], key: e.target.value };
                      handleChange("featured_services.services", next);
                    }}
                  />
                  <input
                    placeholder="Card title (e.g., Pet Hotel)"
                    value={svc.title || ""}
                    onChange={(e) => {
                      const next = [...data.services];
                      next[idx] = { ...next[idx], title: e.target.value };
                      handleChange("featured_services.services", next);
                    }}
                  />
                  <textarea
                    placeholder="Short description of this service"
                    value={svc.description || ""}
                    onChange={(e) => {
                      const next = [...data.services];
                      next[idx] = { ...next[idx], description: e.target.value };
                      handleChange("featured_services.services", next);
                    }}
                    rows={2}
                  />
                  <input
                    placeholder="Button text (e.g., Book Hotel)"
                    value={svc.cta || ""}
                    onChange={(e) => {
                      const next = [...data.services];
                      next[idx] = { ...next[idx], cta: e.target.value };
                      handleChange("featured_services.services", next);
                    }}
                  />
                  <button
                    type="button"
                    className="editor-btn-remove"
                    onClick={() => {
                      const next = data.services.filter((_, i) => i !== idx);
                      handleChange("featured_services.services", next);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="editor-btn-small"
                onClick={() =>
                  handleChange("featured_services.services", [
                    ...(data.services || []),
                    { key: "", title: "", description: "", cta: "", icon: "" },
                  ])
                }
              >
                <FontAwesomeIcon icon={faPlus} /> Add Service
              </button>
            </div>
          </div>
        );
      case "how_it_works":
        return (
          <div className="editor-form">
            {renderInput("Small top text (above the section title)", "how_it_works.eyebrow")}
            {renderInput("Section title", "how_it_works.headline")}
            <div className="editor-array">
              <strong>Process steps</strong>
              {(data.steps || []).map((step, idx) => (
                <div key={idx} className="editor-array-item">
                  <input
                    placeholder="Step number (e.g., 01)"
                    value={step.number || ""}
                    onChange={(e) => {
                      const next = [...data.steps];
                      next[idx] = { ...next[idx], number: e.target.value };
                      handleChange("how_it_works.steps", next);
                    }}
                  />
                  <input
                    placeholder="Step title"
                    value={step.title || ""}
                    onChange={(e) => {
                      const next = [...data.steps];
                      next[idx] = { ...next[idx], title: e.target.value };
                      handleChange("how_it_works.steps", next);
                    }}
                  />
                  <textarea
                    placeholder="Step description"
                    value={step.description || ""}
                    onChange={(e) => {
                      const next = [...data.steps];
                      next[idx] = { ...next[idx], description: e.target.value };
                      handleChange("how_it_works.steps", next);
                    }}
                    rows={2}
                  />
                  <button
                    type="button"
                    className="editor-btn-remove"
                    onClick={() => {
                      const next = data.steps.filter((_, i) => i !== idx);
                      handleChange("how_it_works.steps", next);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="editor-btn-small"
                onClick={() =>
                  handleChange("how_it_works.steps", [
                    ...(data.steps || []),
                    { number: "", title: "", description: "" },
                  ])
                }
              >
                <FontAwesomeIcon icon={faPlus} /> Add Step
              </button>
            </div>
          </div>
        );
      case "about":
        return (
          <div className="editor-form">
            {renderInput("Small top text (above the section title)", "about.eyebrow")}
            {renderInput("Section title", "about.headline")}
            {renderInput("About us paragraph", "about.description", "textarea")}
            {renderImageField("About section image", "about.image")}
            {renderArrayField("Highlight points (reasons to choose us)", "about.points", [
              { key: "title", label: "Point title", default: "" },
              { key: "description", label: "Point description", default: "" },
            ])}
          </div>
        );
      case "final_cta":
        return (
          <div className="editor-form">
            {renderInput("Small top text (above the section title)", "final_cta.eyebrow")}
            {renderInput("Section title", "final_cta.headline")}
            {renderInput("Description paragraph", "final_cta.description", "textarea")}
            {renderInput("Main button text", "final_cta.primary_cta")}
            {renderInput("Second button text", "final_cta.secondary_cta")}
          </div>
        );
      case "trust_stats":
        return (
          <div className="editor-form">
            {renderArrayField("Quick stats (numbers at a glance)", "trust_stats.stats", [
              { key: "value", label: "Stat number (e.g., 9+)", default: "" },
              { key: "label", label: "What it means (e.g., Core Services)", default: "" },
            ])}
          </div>
        );
      case "facilities_gallery":
        return (
          <div className="editor-form">
            {renderInput("Small top text (above the section title)", "facilities_gallery.eyebrow")}
            {renderInput("Section title", "facilities_gallery.headline")}
            {renderInput("Description paragraph", "facilities_gallery.description", "textarea")}
            <div className="editor-array">
              <strong>Facility photos (each can have a caption and an uploaded image)</strong>
              {(data.items || []).map((item, idx) => (
                <div key={idx} className="editor-array-item editor-facility-item">
                  <input
                    placeholder="Caption (e.g., Reception Area)"
                    value={item.caption || ""}
                    onChange={(e) => {
                      const next = [...data.items];
                      next[idx] = { ...next[idx], caption: e.target.value };
                      handleChange("facilities_gallery.items", next);
                    }}
                  />
                  <label className="editor-facility-upload">
                    <span>Upload photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFacilityImageUpload(e, idx)}
                    />
                    {uploading && <FontAwesomeIcon icon={faSpinner} spin />}
                  </label>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.caption}
                      className="editor-facility-preview"
                    />
                  )}
                  {!item.image && (
                    <span className="editor-facility-default">Using default facility photo</span>
                  )}
                  <button
                    type="button"
                    className="editor-btn-remove"
                    onClick={() => {
                      const next = data.items.filter((_, i) => i !== idx);
                      handleChange("facilities_gallery.items", next);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="editor-btn-small"
                onClick={() =>
                  handleChange("facilities_gallery.items", [
                    ...(data.items || []),
                    { caption: "", image: null },
                  ])
                }
              >
                <FontAwesomeIcon icon={faPlus} /> Add Photo Slot
              </button>
            </div>
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
              Upload photos to use as full-bleed background images on the Login and Registration pages. If left empty, default facility photos are used automatically.
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
          className="editor-preview-btn"
          title="Open public landing page in a new tab"
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
