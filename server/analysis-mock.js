// MOCK ANALYSIS - for testing the flow without Gemini API
export async function analyzeVehicleDamage(images, vehicleInfo, geminiApiKey) {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    damages: [
      {
        part_name_en: 'Hood',
        part_name_ar: 'كبوت',
        damage_type: 'Dent',
        confidence: 0.95,
        severity_label: 'Repair',
        price: 2800,
        is_ai_detected: true,
        partId: 'PT_0001',
        category: 'exterior_body',
        isSafety: false,
      },
      {
        part_name_en: 'Front Left Fender',
        part_name_ar: 'رفرف أمامي شمال',
        damage_type: 'Scratch',
        confidence: 0.87,
        severity_label: 'Repair',
        price: 2000,
        is_ai_detected: true,
        partId: 'PT_0018',
        category: 'exterior_body',
        isSafety: false,
      },
      {
        part_name_en: 'Front Left Headlight',
        part_name_ar: 'فانوس أمامي شمال',
        damage_type: 'Broken',
        confidence: 0.92,
        severity_label: 'Replace',
        price: 5600,
        is_ai_detected: true,
        partId: 'PT_0008',
        category: 'exterior_body',
        isSafety: true,
      },
    ],
    vehicleInfo,
    timestamp: new Date().toISOString(),
  };
}
