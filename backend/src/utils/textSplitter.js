import { logger } from './logger.js';

export class RecursiveCharacterTextSplitter {
  constructor({ chunkSize = 1000, chunkOverlap = 200, separators = ["\n\n", "\n", " ", ""] } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = separators;
  }

  /**
   * Splits a large text string into an array of smaller chunks.
   * @param {string} text 
   * @returns {string[]}
   */
  splitText(text) {
    if (!text || typeof text !== 'string') return [];
    return this._splitText(text, this.separators);
  }

  _splitText(text, separators) {
    const finalChunks = [];
    
    // Choose the best separator present in the text
    let separator = separators[separators.length - 1];
    let indexOfSeparator = separators.length - 1;
    
    for (let i = 0; i < separators.length; i++) {
      if (separators[i] === "") {
        separator = separators[i];
        indexOfSeparator = i;
        break;
      }
      if (text.includes(separators[i])) {
        separator = separators[i];
        indexOfSeparator = i;
        break;
      }
    }

    // Split text by the separator
    const splits = separator === "" ? text.split("") : text.split(separator);

    let currentDoc = [];
    let currentLen = 0;

    for (const split of splits) {
      const splitLen = split.length;

      // Calculate how long the chunk would be if we added the split
      const addedLen = splitLen + (currentDoc.length > 0 ? separator.length : 0);

      if (currentLen + addedLen <= this.chunkSize) {
        currentDoc.push(split);
        currentLen += addedLen;
      } else {
        // Output existing accumulated text as a chunk
        if (currentDoc.length > 0) {
          const docText = currentDoc.join(separator).trim();
          if (docText) {
            finalChunks.push(docText);
          }
          
          // Build overlap starting from the end of the current doc
          const overlapDocs = [];
          let overlapLen = 0;
          for (let j = currentDoc.length - 1; j >= 0; j--) {
            const item = currentDoc[j];
            const itemLen = item.length + (overlapDocs.length > 0 ? separator.length : 0);
            
            if (overlapLen + itemLen <= this.chunkOverlap) {
              overlapDocs.unshift(item);
              overlapLen += itemLen;
            } else {
              break;
            }
          }
          currentDoc = overlapDocs;
          currentLen = overlapLen;
        }

        // If the single split is larger than chunkSize, we split it recursively
        if (splitLen > this.chunkSize) {
          const subSeparators = separators.slice(indexOfSeparator + 1);
          if (subSeparators.length > 0) {
            const subChunks = this._splitText(split, subSeparators);
            finalChunks.push(...subChunks);
          } else {
            // No separators left, slice hard
            let idx = 0;
            while (idx < split.length) {
              const chunkStr = split.substring(idx, idx + this.chunkSize);
              if (chunkStr.trim()) finalChunks.push(chunkStr);
              idx += this.chunkSize - this.chunkOverlap;
            }
          }
        } else {
          // If the split fits, append it
          const addedLenAfterOverlap = splitLen + (currentDoc.length > 0 ? separator.length : 0);
          currentDoc.push(split);
          currentLen += addedLenAfterOverlap;
        }
      }
    }

    // Flush remaining text
    if (currentDoc.length > 0) {
      const docText = currentDoc.join(separator).trim();
      if (docText) {
        finalChunks.push(docText);
      }
    }

    return finalChunks;
  }
}
export default RecursiveCharacterTextSplitter;
