/**
 * Emergency categories, mirrored from case_store/triage.py in the bot repo (code -> Marathi
 * label, base priority). Keep the two in step: a code the bot adds and this file lacks is
 * still counted, under its code, with no label.
 */
export const CATEGORIES: Record<string, { mr: string; en: string; basePriority: "P1" | "P2" }> = {
  weapon_attack: { mr: "शस्त्राने हल्ला", en: "Weapon attack", basePriority: "P1" },
  fight_riot: { mr: "मारामारी / दंगल", en: "Fight / riot", basePriority: "P1" },
  assault: { mr: "मारहाण", en: "Assault", basePriority: "P2" },
  domestic_violence: { mr: "घरगुती हिंसाचार", en: "Domestic violence", basePriority: "P2" },
  sexual_assault: { mr: "लैंगिक अत्याचार", en: "Sexual assault", basePriority: "P1" },
  harassment_women: { mr: "महिलांची छेडछाड / पाठलाग", en: "Harassment of women", basePriority: "P2" },
  kidnapping: { mr: "अपहरण", en: "Kidnapping", basePriority: "P1" },
  missing_child: { mr: "हरवलेले मूल", en: "Missing child", basePriority: "P1" },
  robbery_theft: { mr: "चोरी / लूट", en: "Robbery / theft", basePriority: "P2" },
  theft: { mr: "चोरी", en: "Theft", basePriority: "P2" },
  vehicle_theft: { mr: "वाहन चोरी", en: "Vehicle theft", basePriority: "P2" },
  cyber_fraud: { mr: "सायबर फसवणूक", en: "Cyber fraud", basePriority: "P2" },
  break_in: { mr: "घरफोडी", en: "Break-in", basePriority: "P2" },
  threat: { mr: "धमकी", en: "Threat", basePriority: "P2" },
  accident: { mr: "अपघात", en: "Accident", basePriority: "P2" },
  fire: { mr: "आग", en: "Fire", basePriority: "P1" },
  medical: { mr: "वैद्यकीय आपत्काल", en: "Medical emergency", basePriority: "P1" },
  self_harm: { mr: "आत्महत्येचा धोका", en: "Risk of self-harm", basePriority: "P1" },
  crowd_stampede: { mr: "गर्दी / चेंगराचेंगरी", en: "Crowd / stampede", basePriority: "P1" },
  suspicious_object: { mr: "संशयास्पद वस्तू / व्यक्ती", en: "Suspicious object / person", basePriority: "P2" },
  other: { mr: "इतर आपत्काल", en: "Other emergency", basePriority: "P2" },
};

/** Labels for a category code; a code this file doesn't know yet gets a readable English one. */
export function categoryLabel(code: unknown) {
  const key = typeof code === "string" && code ? code : "other";
  const known = CATEGORIES[key];
  const readable = key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return { code: key, mr: known?.mr ?? null, en: known?.en ?? readable };
}

export const CASE_STATUSES = ["new", "alerted", "acknowledged", "closed"] as const;
export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const VERDICTS = ["genuine", "hoax", "unverifiable"] as const;
