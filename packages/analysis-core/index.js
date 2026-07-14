/**
 * ANALYSIS CORE - Vehicle Damage Analysis Engine
 *
 * Shared module used by both B2C (wreck-vision) and Workshop apps.
 *
 * ARCHITECTURE:
 * - V0 (current): Thin wrapper that re-exports from ../../local-server.cjs
 * - V1 (future): Pure module with full extraction (no Express dependency)
 *
 * EXPORTS:
 * - Constants: DAMAGE_TYPE_INDEX, PARTS_DATABASE, DAMAGE_DESCRIPTIONS
 * - Functions: runAnalysisPipeline, enrichDamageData, getSeverityDecision, etc.
 *
 * USAGE:
 *   const { runAnalysisPipeline, enrichDamageData, PARTS_DATABASE } = require('@gfast/analysis-core');
 *
 *   const result = await runAnalysisPipeline({
 *     images: [...base64 images...],
 *     vehicleInfo: { year, make, model },
 *     imageViews: ['front', 'back', ...],
 *     imageAngles: ['wide', 'close', ...]
 *   });
 *
 *   const enriched = enrichDamageData(result, vehicleInfo);
 */

const path = require('path');

// Re-export from local-server.cjs
// This is a transitional approach - full extraction to pure module will happen in V1
const core = require(path.join(__dirname, './local-server.cjs'));

module.exports = {
  // ========================================================================
  // CONSTANTS
  // ========================================================================

  /** Damage type → severity index mapping (0-5)
   *  Index < 4 → Repair, Index >= 4 → Replace, Unknown → Replace
   */
  DAMAGE_TYPE_INDEX: core.DAMAGE_TYPE_INDEX,

  /** Vehicle parts database: 202 parts with EN/AR names, categories, prices
   *  Keys: part IDs (e.g., "PT_0001"), Values: {nameEn, nameAr, category, price, ...}
   */
  PARTS_DATABASE: core.PARTS_DATABASE,

  /** Damage descriptions reference (used in Gemini prompts)
   */
  DAMAGE_DESCRIPTIONS: core.DAMAGE_DESCRIPTIONS,

  /** Valid vehicle view labels (e.g., "front", "back", "left", "right")
   */
  VEHICLE_VIEW_KEYS: core.VEHICLE_VIEW_KEYS,

  /** Valid image angle labels (e.g., "wide", "close")
   */
  IMAGE_ANGLE_KEYS: core.IMAGE_ANGLE_KEYS,

  /** Part name alias map — normalizes Gemini output to canonical PARTS_DATABASE keys
   *  e.g., "front_bumper" → "upper_bumper", "b_pillar_right" → "b_pillar"
   */
  PART_NAME_ALIASES: core.PART_NAME_ALIASES,

  // ========================================================================
  // CORE FUNCTIONS
  // ========================================================================

  /**
   * Run the full 4-stage Gemini vehicle damage analysis pipeline
   * @param {Object} options
   * @param {string[]} options.images - Array of base64-encoded images
   * @param {Object} options.vehicleInfo - { year, make, model, location? }
   * @param {string[]} options.imageViews - (Optional) View labels
   * @param {string[]} options.imageAngles - (Optional) Angle labels
   * @returns {Promise<Object>} Raw analysis result
   *
   * PIPELINE:
   * Stage 1: Image quality check + vehicle identification
   * Stage 2: Visible damage detection (parts, damage types, confidence)
   * Stage 3: Structural damage assessment
   * Stage 4: Hidden damage inference
   */
  runAnalysisPipeline: core.runAnalysisPipeline,

  /**
   * Enrich raw analysis with part names (EN/AR), prices, severity decisions
   * @param {Object} rawAnalysis - Output from runAnalysisPipeline
   * @param {Object} vehicleInfo - { year, make, model }
   * @returns {Object} UI-ready analysis with enriched part info
   */
  enrichDamageData: core.enrichDamageData,

  /**
   * Get severity decision (Repair/Replace) for a single damage type
   * @param {string} damageType - Damage type (e.g., "dent", "crack")
   * @returns {Object} { decision: "Repair"|"Replace", index, isKnownType }
   */
  getSeverityDecision: core.getSeverityDecision,

  /**
   * Get worst-case severity decision for multiple damage types
   * @param {string[]} damageTypes - Array of damage types
   * @returns {Object} { decision, maxIndex, hasUnknownType }
   */
  getMultipleDamageDecision: core.getMultipleDamageDecision,

  // ========================================================================
  // HELPER FUNCTIONS (less commonly used)
  // ========================================================================

  parseStageJSON: core.parseStageJSON,
  normalizePartName: core.normalizePartName,
  formatPartName: core.formatPartName,
  calculateCosts: core.calculateCosts,
  callGeminiRaw: core.callGeminiRaw,
  callGeminiWithImages: core.callGeminiWithImages,
  callGeminiTextOnly: core.callGeminiTextOnly,
  compressImages: core.compressImages,

  // ========================================================================
  // METADATA
  // ========================================================================
  version: '1.0.0',
  description: 'Core vehicle damage analysis engine - shared between B2C and Workshop apps',
  architecture: 'V0: Wrapper around local-server.cjs | V1: Pure module (planned)',
};
