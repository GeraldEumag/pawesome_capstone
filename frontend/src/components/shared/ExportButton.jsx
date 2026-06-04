import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv, faFileExcel, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { showError } from '../../utils/alert';
import './ExportButton.css';

/**
 * ExportButton Component
 * Universal export button with format dropdown
 */

const ExportButton = ({ 
  onExport, 
  data, 
  filename,
  formats = ['csv', 'excel'],
  className = '',
  label = 'Export',
  disabled = false,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format) => {
    setIsExporting(true);
    setShowDropdown(false);
    
    try {
      if (onExport) {
        await onExport(format);
      }
    } catch (err) {
      console.error('Export error:', err);
      showError('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const formatIcons = {
    csv: faFileCsv,
    excel: faFileExcel,
    pdf: faFilePdf,
  };

  const formatLabels = {
    csv: 'Export as CSV',
    excel: 'Export as Excel',
    pdf: 'Export as PDF',
  };

  return (
    <div className={`export-button-wrapper ${className}`}>
      <button
        className="export-button"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled || isExporting || !data}
      >
        <FontAwesomeIcon icon={faDownload} spin={isExporting} />
        <span>{isExporting ? 'Exporting...' : label}</span>
        <span className="dropdown-arrow">▼</span>
      </button>
      
      {showDropdown && (
        <>
          <div className="export-dropdown-overlay" onClick={() => setShowDropdown(false)} />
          <div className="export-dropdown">
            {formats.map((format) => (
              <button
                key={format}
                className="export-option"
                onClick={() => handleExport(format)}
              >
                <FontAwesomeIcon icon={formatIcons[format]} />
                <span>{formatLabels[format]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExportButton;
