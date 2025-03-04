import React, { useState, useEffect } from "react";
import { SelectableGroup, createSelectable } from "react-selectable-fast";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import Papa from "papaparse";
import "./WellPlateSelector.css";
import JSZip from "jszip";


// Default metadata fields
const DEFAULT_METADATA = {
  base_strain: "",
  receptor: "",
  anchor: "",
  nanobody: "",
  negsel: "",
  dilution: "",
  notes: "",
};

// Generate distinct colors for unique metadata values
const colorMap = {};
const getColorForValue = (value) => {
  if (!value) return "#e0e0e0"; // Neutral gray if no metadata
  if (!colorMap[value]) {
    const randomColor = `hsl(${Math.random() * 360}, 60%, 75%)`; // Unique pleasant colors
    colorMap[value] = randomColor;
  }
  return colorMap[value];
};

// Selectable well component
const Well = createSelectable(({ selectableRef, isSelected, wellId, metadata, displayedField }) => {
  const fieldValue = metadata[wellId]?.[displayedField] || "";
  const backgroundColor = isSelected ? "#007bff" : getColorForValue(fieldValue);

  return (
    <div
      ref={selectableRef}
      className={`well ${isSelected ? "selected" : ""}`}
      style={{ backgroundColor }}
    >
      <strong>{wellId}</strong>
      <div className="well-info">
        <span>{fieldValue || "-"}</span>
      </div>
    </div>
  );
});

const WellPlateSelector = () => {
  const [plates, setPlates] = useState([{ id: 1, metadata: {} }]); // Multiple plates support
  const [currentPlateIndex, setCurrentPlateIndex] = useState(0);
  const [selectedWells, setSelectedWells] = useState(new Set());
  const [displayedField, setDisplayedField] = useState("base_strain");
  const [bulkValue, setBulkValue] = useState("");
  const [selectionKey, setSelectionKey] = useState(0); // Forces re-render
  const [csvData, setCsvData] = useState([]); // Store CSV data
  const [targetPlateIndex, setTargetPlateIndex] = useState(0); // Stores the selected position

  // Initialize metadata for all wells in a new plate
  const initializePlateMetadata = () => {
    const initializedMetadata = {};
    for (let row = 0; row < 8; row++) {
      for (let col = 1; col <= 12; col++) {
        const wellId = `${String.fromCharCode(65 + row)}${col}`;
        initializedMetadata[wellId] = { ...DEFAULT_METADATA };
      }
    }
    return initializedMetadata;
  };

  // Ensure first plate starts with metadata
  useEffect(() => {
    setPlates([{ id: 1, metadata: initializePlateMetadata() }]);
  }, []);

  // Handle selection (reset selected wells each time)
  const handleSelection = (selectedItems) => {
    const newSelection = new Set();
    selectedItems.forEach((item) => {
      newSelection.add(item.props.wellId);
    });
    setSelectedWells(newSelection);
  };

  // **Apply bulk metadata update for the current plate only**
  const applyBulkUpdate = () => {
    if (selectedWells.size === 0) return;

    setPlates((prevPlates) => {
      const updatedPlates = [...prevPlates];
      selectedWells.forEach((well) => {
        updatedPlates[currentPlateIndex].metadata[well] = {
          ...updatedPlates[currentPlateIndex].metadata[well],
          [displayedField]: bulkValue,
        };
      });
      return updatedPlates;
    });

    setBulkValue(""); 
    deselectAll();
  };

  // **Clear all metadata for the current plate**
  const clearField = () => {
    setPlates((prevPlates) => {
      const updatedPlates = [...prevPlates];

      // ✅ Loop through all wells in the current plate and reset metadata
      Object.keys(updatedPlates[currentPlateIndex].metadata).forEach((well) => {
        updatedPlates[currentPlateIndex].metadata[well] = { ...DEFAULT_METADATA };
      });

      return updatedPlates;
    });
  };

  // Deselect all selected wells
  const deselectAll = () => {
    setSelectedWells(new Set());
    setSelectionKey((prev) => prev + 1);
  };

  // **Insert a new plate immediately after the current plate**
  const addNewPlate = () => {
    setPlates((prevPlates) => {
      // ✅ Create the new plate
      const newPlate = { id: prevPlates.length + 1, metadata: initializePlateMetadata() };

      // ✅ Insert the new plate at the correct position
      const updatedPlates = [
        ...prevPlates.slice(0, currentPlateIndex + 1), // Keep plates before current
        newPlate, // Insert new plate
        ...prevPlates.slice(currentPlateIndex + 1), // Keep plates after current
      ];

      // ✅ Renumber all plates sequentially
      updatedPlates.forEach((plate, index) => {
        plate.id = index + 1;
      });

      return updatedPlates;
    });

    setCurrentPlateIndex((prevIndex) => prevIndex + 1); // ✅ Move to the newly added plate
  };

  const nextPlate = () => {
    if (currentPlateIndex < plates.length - 1) {
      setCurrentPlateIndex((prev) => prev + 1);
      deselectAll();
    }
  };

  const prevPlate = () => {
    if (currentPlateIndex > 0) {
      setCurrentPlateIndex((prev) => prev - 1);
      deselectAll();
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    // First, check the first few rows to detect format
    Papa.parse(file, {
      preview: 5, // Read first 5 rows to detect format
      skipEmptyLines: true,
      complete: (result) => {
        const firstRow = result.data[0];
        const isOldFormat = firstRow && firstRow.includes("from_block"); // Check for known header
        console.log(`Detected format: ${isOldFormat ? "Old Format" : "New Format"}`);
  
        // Process file again with the correct format
        Papa.parse(file, {
          header: isOldFormat, // ✅ Use headers for old format, raw data for new format
          skipEmptyLines: true,
          complete: (result) => {
            let newPlates = [];
  
            if (isOldFormat) {
              // ✅ Process OLD FORMAT (uses headers like "from_block", "well", etc.)
              const uploadedPlates = {};
  
              result.data.forEach((row) => {
                const plateId = parseInt(row["from_block"], 10);
                const wellId = row["well"];
                if (!plateId || !wellId) return;
  
                if (!uploadedPlates[plateId]) {
                  uploadedPlates[plateId] = initializePlateMetadata(); // ✅ Initialize wells
                }
  
                uploadedPlates[plateId][wellId] = {
                  base_strain: row["base_strain"] || "",
                  receptor: row["receptor"] || "",
                  anchor: row["anchor"] || "",
                  nanobody: row["nanobody"] || "",
                  negsel: row["negsel"] || "",
                  dilution: row["dilution"] || "",
                  notes: row["notes"] || "",
                };
              });
  
              newPlates = Object.keys(uploadedPlates).map((id) => ({
                id: parseInt(id, 10),
                metadata: uploadedPlates[id],
              }));
            } else {
              // ✅ Process NEW FORMAT (plate layout with "Block X")
              let currentPlate = null;
              let currentPlateId = null;
  
              result.data.forEach((row) => {
                if (row[0] && row[0].startsWith("Block")) {
                  // ✅ Start a new plate when "Block X" is found
                  if (currentPlateId !== null) {
                    newPlates.push(currentPlate);
                  }
  
                  // Extract plate number from "Block X"
                  currentPlateId = parseInt(row[0].replace("Block ", ""), 10);
                  currentPlate = { id: currentPlateId, metadata: initializePlateMetadata() }; // ✅ Ensure all wells exist
                } else if (currentPlate) {
                  // ✅ Process well data (rows A-H)
                  const rowLabel = row[0]; // A, B, C, etc.
                  if (rowLabel && ["A", "B", "C", "D", "E", "F", "G", "H"].includes(rowLabel)) {
                    for (let col = 1; col <= 12; col++) {
                      const wellId = `${rowLabel}${col}`;
                      const baseStrain = row[col] ? row[col].trim() : "";
  
                      // ✅ Always keep the well, even if it's blank
                      currentPlate.metadata[wellId] = {
                        ...DEFAULT_METADATA,
                        base_strain: baseStrain,
                      };
                    }
                  }
                }
              });
  
              // ✅ Add last plate if it has data
              if (currentPlate) {
                newPlates.push(currentPlate);
              }
            }
  
            // ✅ Remove empty plates (where ALL wells are empty)
            newPlates = newPlates.filter((plate) =>
              Object.values(plate.metadata).some(
                (wellData) => Object.values(wellData).some((val) => val !== "")
              )
            );
  
            // ✅ Update state if plates exist
            if (newPlates.length > 0) {
              setPlates(newPlates);
              setCurrentPlateIndex(0); // Reset to first plate
            }
          },
        });
      },
    });
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    Papa.parse(file, {
      header: false, // ❌ Do NOT treat first row as headers (since we skip first row manually)
      skipEmptyLines: true, // ✅ Remove blank rows
      complete: (result) => {
        let rawData = result.data;
  
        if (rawData.length < 2) {
          console.error("CSV does not contain enough rows!");
          return;
        }
  
        // ✅ Use the second row as actual headers
        let originalHeaders = rawData[1].map((header) => header.trim().replace(/\s+/g, "_"));
  
        // ✅ Ensure unique headers by appending a counter to duplicates
        let headerCount = {};
        let uniqueHeaders = originalHeaders.map((header) => {
          if (headerCount[header]) {
            headerCount[header]++;
            return `${header}_${headerCount[header]}`; // Rename duplicate headers
          } else {
            headerCount[header] = 1;
            return header; // Keep the first occurrence unchanged
          }
        });
  
        // ✅ Map remaining rows to new headers
        let cleanedData = rawData.slice(1).map((row) => {
          let rowData = {};
          uniqueHeaders.forEach((key, index) => {
            rowData[key] = row[index] || ""; // Ensure valid mapping
          });
          return rowData;
        });
  
        cleanedData = cleanedData.filter(row => Object.values(row).some(val => val !== "")); // ✅ Remove empty rows
  
        console.log("Final Cleaned CSV Data with Unique Headers:", cleanedData); // ✅ Debugging output
        setCsvData(cleanedData);
      },
    });
  };

  const exportCSV = () => {
    const csvHeader = "from_block,well,base_strain,receptor,anchor,nanobody,negsel,dilution,notes\n";
    const csvRows = [];
  
    plates.forEach((plate) => {
      Object.keys(plate.metadata).forEach((well) => {
        const data = plate.metadata[well] || DEFAULT_METADATA;
        
        // ✅ Check if ALL metadata fields are empty
        const isEmptyRow = Object.values(data).every((val) => val === "" || val === null || val === undefined);
  
        // ✅ If the entire row is empty, set all fields to "empty"
        if (isEmptyRow) {
          csvRows.push(`${plate.id},${well},empty,empty,empty,empty,empty,empty,empty`);
        } else {
          // ✅ Keep existing values, replace only truly empty fields with ""
          const rowData = [
            data.base_strain || "",
            data.receptor || "",
            data.anchor || "",
            data.nanobody || "",
            data.negsel || "",
            data.dilution || "",
            data.notes || "",
          ];
  
          csvRows.push(`${plate.id},${well},${rowData.join(",")}`);
        }
      });
    });
  
    const csvContent = csvHeader + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    saveAs(blob, "spots.csv");
  };

  const searchStrainByNumber = () => {
    setPlates((prevPlates) => {
      return prevPlates.map((plate) => {
        const updatedMetadata = { ...plate.metadata };
  
        // ✅ Loop through all wells in this plate
        Object.keys(updatedMetadata).forEach((well) => {
          const wellMetadata = updatedMetadata[well];
          const strainNumber = wellMetadata.base_strain || ""; // Assume strain number is stored in base_strain
  
          if (!strainNumber) return; // Skip wells without a base strain
  
          // ✅ Find the row where `Strain_Name` matches `base_strain`
          const matchingRow = csvData.find((row) => row["Strain_Name"] === strainNumber);
  
          if (matchingRow) {
            // ✅ Extract corresponding metadata values
            updatedMetadata[well] = {
              ...wellMetadata,
              negsel: matchingRow["Construct_1"] || "",
              anchor: matchingRow["Construct_2"] || "",
              receptor: matchingRow["Construct_3"] || "",
            };
          }
        });
  
        return { ...plate, metadata: updatedMetadata };
      });
    });
  };

  // **Copy the current plate and insert it after the current plate**
  const copyCurrentPlate = () => {
    setPlates((prevPlates) => {
      // ✅ Create a deep copy of the current plate's metadata
      const copiedPlate = {
        id: prevPlates.length + 1, // Temporary ID, will be renumbered
        metadata: JSON.parse(JSON.stringify(prevPlates[currentPlateIndex].metadata)), // Deep copy metadata
      };

      // ✅ Insert the copied plate immediately after the current one
      const updatedPlates = [
        ...prevPlates.slice(0, currentPlateIndex + 1), // Keep plates before current
        copiedPlate, // Insert copied plate
        ...prevPlates.slice(currentPlateIndex + 1), // Keep plates after current
      ];

      // ✅ Renumber all plates sequentially
      updatedPlates.forEach((plate, index) => {
        plate.id = index + 1;
      });

      return updatedPlates;
    });

    setCurrentPlateIndex((prevIndex) => prevIndex + 1); // ✅ Move to the copied plate
    deselectAll();
  };

  // **Delete the current plate and reorder plate numbers**
  const deleteCurrentPlate = () => {
    setPlates((prevPlates) => {
      // Prevent deleting the last remaining plate
      if (prevPlates.length === 1) {
        alert("You must have at least one plate.");
        return prevPlates;
      }

      // ✅ Remove the current plate
      let updatedPlates = prevPlates.filter((_, index) => index !== currentPlateIndex);

      // ✅ Reorder plate numbers sequentially
      updatedPlates = updatedPlates.map((plate, index) => ({
        ...plate,
        id: index + 1, // Renumber plates starting from 1
      }));

      // ✅ Update current plate index (stay on previous plate or first plate)
      const newIndex = Math.max(0, currentPlateIndex - 1);
      setCurrentPlateIndex(newIndex);

      return updatedPlates;
    });

    deselectAll();
  };

  const moveCurrentPlate = () => {
    setPlates((prevPlates) => {
      if (prevPlates.length === 1) {
        alert("You must have at least one plate.");
        return prevPlates;
      }

      if (targetPlateIndex < 0 || targetPlateIndex >= prevPlates.length) {
        alert("Invalid plate position.");
        return prevPlates;
      }

      // ✅ Remove the current plate from its position
      const plateToMove = prevPlates[currentPlateIndex];
      let updatedPlates = prevPlates.filter((_, index) => index !== currentPlateIndex);

      // ✅ Insert the plate at the new position
      updatedPlates.splice(targetPlateIndex, 0, plateToMove);

      // ✅ Renumber all plates sequentially
      updatedPlates = updatedPlates.map((plate, index) => ({
        ...plate,
        id: index + 1, // Assign new plate numbers
      }));

      setCurrentPlateIndex(targetPlateIndex); // ✅ Move to the newly positioned plate
      return updatedPlates;
    });

    deselectAll();
  };

  const exportPDF = async () => {
    const zip = new JSZip(); // ✅ Create ZIP file
    const originalPlateIndex = currentPlateIndex; // ✅ Store original plate index
  
    for (const plateIndex in plates) {
      setCurrentPlateIndex(parseInt(plateIndex)); // ✅ Switch to current plate
      await new Promise((resolve) => setTimeout(resolve, 50)); // ✅ Allow UI update
  
      const pdf = new jsPDF("p", "mm", "a4"); // ✅ Create a new PDF
      let yOffset = 15; // ✅ Reset Y-position
  
      for (const field of Object.keys(DEFAULT_METADATA)) {
        setDisplayedField(field); // ✅ Change displayed field dynamically
        await new Promise((resolve) => setTimeout(resolve, 50)); // ✅ Allow UI update
  
        const plateElement = document.querySelector(".well-plate");
        if (!plateElement) {
          console.warn(`Plate element not found for ${field}`);
          continue;
        }
  
        // ✅ Temporarily expand the plate to avoid cropping
        plateElement.style.width = "1000px";
        plateElement.style.overflow = "visible";
  
        // ✅ Capture the well plate as an image
        const canvas = await html2canvas(plateElement, {
          scale: 2,
          width: plateElement.scrollWidth + 500,
          height: plateElement.scrollHeight + 100,
          useCORS: true,
        });
  
        // ✅ Reset styles after capture
        plateElement.style.width = "";
        plateElement.style.overflow = "";
  
        const imgData = canvas.toDataURL("image/jpeg", 0.7); // ✅ Convert to JPEG with compression
  
        // ✅ Get image dimensions
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
  
        // ✅ Define PDF dimensions
        const maxWidth = 170; // ✅ Ensure proper fit
        const aspectRatio = imgHeight / imgWidth;
        const displayHeight = maxWidth * aspectRatio;
  
        // ✅ Add metadata title
        pdf.setFontSize(14);
        pdf.text(`Plate ${plates[plateIndex].id} - ${field}`, 10, yOffset);
  
        // ✅ Add image to PDF
        pdf.addImage(imgData, "JPEG", 10, yOffset + 5, maxWidth, displayHeight);
        yOffset += displayHeight + 15;
  
        // ✅ Add new page if necessary
        if (yOffset > 200) {
          pdf.addPage();
          yOffset = 15;
        }
      }
  
      // ✅ Convert PDF to Blob and add it to ZIP
      const pdfBlob = pdf.output("blob");
      zip.file(`plate_${plates[plateIndex].id}_metadata.pdf`, pdfBlob);
    }
  
    // ✅ Restore original plate index
    setCurrentPlateIndex(originalPlateIndex);
  
    // ✅ Generate ZIP file and trigger download
    zip.generateAsync({ type: "blob" }).then((zipBlob) => {
      saveAs(zipBlob, "plate_metadata.zip");
    });
  };


  return (
    <div className="well-plate-container">
      <h2>96-Well Block Metadata Helper</h2>

      <div className="plate-edit">
        <button className="action-btn" onClick={copyCurrentPlate}>Copy Current Plate</button>
        <button className="action-btn" onClick={addNewPlate}>+ Add Plate</button>
        <button className="action-btn delete-btn" onClick={deleteCurrentPlate}>Delete Current Plate</button>
        <div className="move-plate-container">
          <button className="action-btn" onClick={moveCurrentPlate}>Move Plate</button>
          <select
            value={targetPlateIndex}
            onChange={(e) => setTargetPlateIndex(parseInt(e.target.value, 10))}
          >
            {plates.map((plate, index) => (
              <option key={plate.id} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-toggle">
        {Object.keys(DEFAULT_METADATA).map((field) => (
          <button
            key={field}
            className={`field-btn ${displayedField === field ? "active" : ""}`}
            onClick={() => setDisplayedField(field)}
          >
            {field}
          </button>
        ))}
      </div>

      <input
        type="text"
        className="form-control metadata-input"
        placeholder={`Set ${displayedField} for selected wells`}
        value={bulkValue}
        onChange={(e) => setBulkValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applyBulkUpdate()}
      />


      <div className="button-container">
        <button className="action-btn" onClick={applyBulkUpdate}>Apply</button>
        <button className="action-btn" onClick={clearField}>Clear</button>
        <button className="action-btn" onClick={deselectAll}>Deselect All</button>
        <button className="action-btn" onClick={searchStrainByNumber}>Search Strain</button>
        <button className="action-btn" onClick={exportCSV}>Export CSV</button>
        <button className="action-btn" onClick={exportPDF}>Export PDF</button>
      </div>

      <SelectableGroup key={selectionKey} className="well-plate" onSelectionFinish={handleSelection} allowClickWithoutSelected enableDeselect selectboxClassName="selection-box">
        {Object.keys(plates[currentPlateIndex].metadata).map((wellId) => (
          <Well key={wellId} wellId={wellId} isSelected={selectedWells.has(wellId)} metadata={plates[currentPlateIndex].metadata} displayedField={displayedField} />
        ))}
      </SelectableGroup>

      <div className="plate-nav">
        <button className="template-btn" onClick={prevPlate} disabled={currentPlateIndex === 0}>← Previous Plate</button>
        <span>Block {plates[currentPlateIndex].id}</span>
        <button className="template-btn" onClick={nextPlate} disabled={currentPlateIndex === plates.length - 1}>Next Plate →</button>        
      </div>

      <div className="upload-container">
        <div className="upload-box">
          <h3>Upload a CSV file with metadata:</h3>
          <input type="file" accept=".csv" className="file-upload" onChange={handleFileUpload} />
        </div>

        <div className="upload-box">
          <h3>Upload a CSV file from NP Plasmids Google Sheet:</h3>
          <input type="file" accept=".csv" className="file-upload" onChange={handleCsvUpload} />
        </div>
      </div>


      <h3>Download Templates for Metadata:</h3>
      <a href="/basestrain_wells.csv" download>
        <button className="template-btn">Download Base Strain Template</button>
      </a>
      <a href="/spots.csv" download>
        <button className="template-btn">Download Metadata Template</button>
      </a>
      <p>You can choose either tempate. basestrain template is in well format. The metadata template is in the form that is is outputted in.
        You can also use the metadata template to upload the data back into the app.</p>
      

    </div>
  );
};

export default WellPlateSelector;