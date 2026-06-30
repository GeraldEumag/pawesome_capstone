import { useState, useRef, useCallback, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faBuilding } from "@fortawesome/free-solid-svg-icons";
import locationImg    from "../../assets/location.jpg";
import facility1Img   from "../../assets/facility 1.jpg";
import facility2Img   from "../../assets/facility 2.jpg";
import facility3Img   from "../../assets/facility 3.jpg";
import playgroundImg  from "../../assets/play ground.jpg";
import receptionImg   from "../../assets/Reception are.jpg";
import vetClinic1Img  from "../../assets/veterinary clinic.jpg";
import vetClinic2Img  from "../../assets/veterinary clinic 2.jpg";
import "./DynamicFacilitiesGallery.css";

const DEFAULT_IMAGES = [
  locationImg,
  facility1Img,
  facility2Img,
  facility3Img,
  playgroundImg,
  receptionImg,
  vetClinic1Img,
  vetClinic2Img,
];

const DEFAULT_GALLERY = {
  eyebrow: "Our Facilities",
  headline: "See Inside Pawesome Retreat",
  description:
    "Take a look at our clean, comfortable, and well-equipped facilities designed for every pet.",
  items: [
    { caption: "Location",            image: null },
    { caption: "Facility 1",          image: null },
    { caption: "Facility 2",          image: null },
    { caption: "Facility 3",          image: null },
    { caption: "Play Ground",         image: null },
    { caption: "Reception Area",      image: null },
    { caption: "Veterinary Clinic",   image: null },
    { caption: "Veterinary Clinic 2", image: null },
  ],
};

const DynamicFacilitiesGallery = ({ content }) => {
  const data  = content ?? DEFAULT_GALLERY;
  const items = data.items?.length ? data.items : DEFAULT_GALLERY.items;

  const [current, setCurrent]   = useState(0);
  const [animDir, setAnimDir]   = useState(null);
  const touchStartX             = useRef(null);
  const mouseStartX             = useRef(null);
  const isDragging              = useRef(false);

  const goTo = useCallback(
    (idx) => {
      const next = (idx + items.length) % items.length;
      setAnimDir(next > current ? "left" : "right");
      setCurrent(next);
    },
    [current, items.length]
  );

  const prev = useCallback(() => goTo(current - 1), [current, goTo]);
  const next = useCallback(() => goTo(current + 1), [current, goTo]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prev, next]);

  const onTouchStart  = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd    = (e) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) delta > 0 ? next() : prev();
    touchStartX.current = null;
  };

  const onMouseDown   = (e) => { mouseStartX.current = e.clientX; isDragging.current = true; };
  const onMouseUp     = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const delta = mouseStartX.current - e.clientX;
    if (Math.abs(delta) > 40) delta > 0 ? next() : prev();
    mouseStartX.current = null;
  };
  const onMouseLeave  = () => { isDragging.current = false; };

  const getImage = (item, idx) => item.image || DEFAULT_IMAGES[idx] || null;

  return (
    <section className="facilities-gallery" aria-label="Facilities Gallery">
      <div className="facilities-gallery-header">
        <span className="landing-eyebrow">{data.eyebrow}</span>
        <h2>{data.headline}</h2>
        <p>{data.description}</p>
      </div>

      <div className="facilities-carousel-wrapper">
        <button
          className="facilities-arrow facilities-arrow-prev"
          onClick={prev}
          aria-label="Previous photo"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>

        <div
          className="facilities-carousel-track"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        >
          {items.map((item, idx) => {
            const imgSrc = getImage(item, idx);
            const isActive = idx === current;
            const isPrev   = idx === (current - 1 + items.length) % items.length;
            const isNext   = idx === (current + 1) % items.length;

            return (
              <div
                key={idx}
                className={[
                  "facilities-slide",
                  isActive ? "active"    : "",
                  isPrev   ? "slide-prev": "",
                  isNext   ? "slide-next": "",
                ].filter(Boolean).join(" ")}
                aria-hidden={!isActive}
              >
                <div className="facilities-slide-inner">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={item.caption}
                      draggable={false}
                    />
                  ) : (
                    <div className="facilities-slide-placeholder">
                      <FontAwesomeIcon icon={faBuilding} />
                    </div>
                  )}
                  <div className="facilities-slide-caption">
                    <span>{item.caption}</span>
                    <span className="facilities-counter">
                      {current + 1} / {items.length}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="facilities-arrow facilities-arrow-next"
          onClick={next}
          aria-label="Next photo"
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <div className="facilities-dots" role="tablist" aria-label="Gallery navigation">
        {items.map((_, idx) => (
          <button
            key={idx}
            role="tab"
            aria-selected={idx === current}
            aria-label={`Photo ${idx + 1}`}
            className={`facilities-dot${idx === current ? " active" : ""}`}
            onClick={() => goTo(idx)}
          />
        ))}
      </div>
    </section>
  );
};

export default DynamicFacilitiesGallery;
