import { ConsultationRecord } from '../types/pharmacy';

export const DEFAULT_CONSULTATIONS: ConsultationRecord[] = [
  {
    id: 'consult-chen-01',
    patientId: 'PT-8821',
    patientName: 'Robert Chen',
    patientAge: 62,
    patientGender: 'Male',
    pharmacistName: 'Dr. Sarah Jenkins, PharmD, BCPS',
    pharmacistTitle: 'Clinical Specialist in Ambulatory Care',
    consultationDate: 'November 4, 2026',
    pharmacyName: 'ScriptCare Clinical Pharmacy & Wellness',
    pharmacyPhone: '(555) 727-4781',
    clinicalSummary: 'Comprehensive discharge medication counseling following mild myocardial infarction. Regimen optimized for secondary cardiac prevention, blood pressure control, and LDL reduction. Key counseling emphasized strict evening administration of Atorvastatin, breakfast timing for Metoprolol, zero grapefruit consumption, and monitoring for postural dizziness.',
    rawTranscript: `PHARMACIST (Dr. Jenkins): Good morning, Mr. Chen. Congratulations on your recovery. Before you head home, I want to review your four essential cardiac medications so you feel 100% confident taking them.

MR. CHEN: Thank you, Dr. Jenkins. It feels like a lot of pills all at once.

PHARMACIST: Perfectly understandable. Let's break them down by time of day so it is very simple.

First, in the morning with your breakfast: you will take your Metoprolol Succinate 50 mg. This is your extended-release beta-blocker to keep your heart rate steady and protect your heart muscle. You must take this pill with or right after breakfast. Do not crush or chew it because it releases slowly over 24 hours. A key safety note: never stop taking Metoprolol abruptly, as that can cause rebound chest pain. Also, avoid drinking alcohol around your morning dose because it can drop your blood pressure too fast and make you lightheaded.

Next, also in the morning with breakfast: Lisinopril 10 mg. This ACE inhibitor relaxes your blood vessels. You can take it alongside your Metoprolol. One important dietary note: do NOT use potassium salt substitutes (like "No-Salt" or Morton Salt Substitute) and avoid high-potassium energy shakes, because Lisinopril holds onto potassium in your kidneys. If you ever feel persistent dizziness when standing up, sit right back down and give us a call.

Along with breakfast, you'll also take your low-dose Aspirin 81 mg. Always take this with food to protect your stomach lining.

MR. CHEN: Got it. Breakfast is Metoprolol, Lisinopril, and Aspirin. What about the cholesterol pill?

PHARMACIST: That is Atorvastatin 40 mg. You will take this ONE pill every evening, around 8:00 PM or with your dinner. Your liver produces the majority of cholesterol while you sleep, which is why evening dosing is most effective.

Now, this is a CRITICAL dietary warning for Atorvastatin: you must completely avoid grapefruit and grapefruit juice. Grapefruit blocks an enzyme in your gut that breaks down the statin. If you drink grapefruit juice, the medication levels in your bloodstream can spike dangerously high and cause severe muscle breakdown, which can injure your kidneys. If you ever develop unexplained, severe muscle pain or tenderness in your thighs or shoulders, stop taking it and call our clinical pharmacy triage line immediately.

MR. CHEN: Wow, good to know about grapefruit. I will stick to orange juice or water. What should I do if I feel really sick or nauseous?

PHARMACIST: If you ever feel too sick, start throwing up, or experience chest tightness or shortness of breath, do not hesitate for a second. If it is chest pain or trouble breathing, call 911 immediately. If you experience severe nausea, dizziness, or cannot keep your pills down, you have 24/7 access to our clinical triage hotline, or you can walk right into the ScriptCare Urgent Care clinic just two blocks from your house. It is all integrated right in your ScriptCare app.

MR. CHEN: That gives me so much peace of mind. Thank you, Dr. Jenkins!`,
    medications: [
      {
        id: 'med-atorvastatin-40',
        medicationName: 'Atorvastatin',
        genericName: 'Atorvastatin Calcium',
        brandName: 'Lipitor',
        strength: '40 mg',
        dosageForm: 'Oral film-coated tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily in the evening',
        timeOfDay: ['evening'],
        targetTime: '20:00',
        withFood: 'with_or_without_food',
        foodInstructions: 'Take with evening meal or at bedtime with a full glass of water. STRICTLY AVOID grapefruit and grapefruit juice.',
        purpose: 'Cardiovascular secondary prevention & intensive LDL cholesterol reduction',
        pharmacistAdvice: 'Take consistently at 8:00 PM. Never consume grapefruit juice as it increases drug concentration to toxic levels. Contact pharmacy if severe muscle pain develops.',
        warnings: [
          'Absolute Contraindication: Grapefruit & Grapefruit Juice',
          'Report unexplained severe muscle soreness or dark urine immediately',
          'Avoid heavy alcohol consumption',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: null,
        refillsRemaining: 3,
        nextRefillDate: 'December 4, 2026',
        pillColor: 'White',
        pillShape: 'Elliptical / Oval',
        imprint: 'ATV 40',
      },
      {
        id: 'med-metoprolol-50',
        medicationName: 'Metoprolol Succinate ER',
        genericName: 'Metoprolol Succinate Extended-Release',
        brandName: 'Toprol-XL',
        strength: '50 mg',
        dosageForm: 'Extended-release tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily in the morning',
        timeOfDay: ['morning'],
        targetTime: '08:00',
        withFood: 'with_food',
        foodInstructions: 'Take with or immediately after breakfast. Swallow whole—do NOT crush or chew.',
        purpose: 'Heart rate regulation & post-MI cardiac protection',
        pharmacistAdvice: 'Take with breakfast. Never stop abruptly without physician approval. Avoid alcohol around morning dose.',
        warnings: [
          'FDA Black Box Warning: Do NOT discontinue abruptly (risk of severe rebound ischemia)',
          'Swallow whole: do not crush, chew, or split extended-release tablet',
          'Avoid alcohol consumption',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: 'WARNING: ISCHEMIC HEART DISEASE UPON ABRUPT CESSATION',
        refillsRemaining: 3,
        nextRefillDate: 'December 4, 2026',
        pillColor: 'White',
        pillShape: 'Round scored',
        imprint: 'TOP 50',
      },
      {
        id: 'med-lisinopril-10',
        medicationName: 'Lisinopril',
        genericName: 'Lisinopril',
        brandName: 'Prinivil / Zestril',
        strength: '10 mg',
        dosageForm: 'Oral tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily in the morning',
        timeOfDay: ['morning'],
        targetTime: '08:00',
        withFood: 'with_food',
        foodInstructions: 'Take with morning breakfast and a glass of water. Avoid potassium salt substitutes.',
        purpose: 'Blood pressure control & cardiac remodeling defense',
        pharmacistAdvice: 'Take alongside Metoprolol at breakfast. Avoid potassium salt substitutes. Stand up slowly to avoid lightheadedness.',
        warnings: [
          'FDA Black Box Warning: Fetal Toxicity (Contraindicated in pregnancy)',
          'Do NOT use potassium salt substitutes (No-Salt) or high potassium shakes',
          'Report facial/lip swelling (angioedema) immediately',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: 'WARNING: FETAL TOXICITY',
        refillsRemaining: 3,
        nextRefillDate: 'December 4, 2026',
        pillColor: 'Yellow',
        pillShape: 'Round',
        imprint: 'LIS 10',
      },
      {
        id: 'med-aspirin-81',
        medicationName: 'Aspirin Enteric Coated',
        genericName: 'Acetylsalicylic Acid',
        brandName: 'Bayer Low-Dose',
        strength: '81 mg',
        dosageForm: 'Enteric coated safety tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily in the morning',
        timeOfDay: ['morning'],
        targetTime: '08:00',
        withFood: 'with_food',
        foodInstructions: 'Always take with food or breakfast to minimize stomach irritation.',
        purpose: 'Antiplatelet therapy for arterial clot prevention',
        pharmacistAdvice: 'Take with your morning meal. Protects against blood clot formation.',
        warnings: [
          'Take with meal to protect stomach lining',
          'Watch for unusual bruising or dark stools',
          'Avoid concurrent NSAIDs like Ibuprofen/Naproxen without asking pharmacist',
        ],
        fdaSchedule: 'OTC / Rx Antiplatelet Regimen',
        blackBoxWarning: null,
        refillsRemaining: 5,
        nextRefillDate: 'January 4, 2027',
        pillColor: 'Yellow-Orange',
        pillShape: 'Small round',
        imprint: 'BAYER 81',
      },
    ],
    generalDietaryWarnings: [
      {
        category: 'Severe Food Interaction',
        foodOrDrink: 'Grapefruit and Grapefruit Juice',
        riskLevel: 'severe',
        interactsWith: ['Atorvastatin (Lipitor)'],
        explanation: 'Grapefruit irreversibly inhibits intestinal CYP3A4 enzymes, dramatically increasing Atorvastatin blood levels up to 300%. This causes severe risk of rhabdomyolysis (skeletal muscle breakdown) and acute renal failure.',
        safeAlternative: 'Orange juice, apple juice, grape juice, or lemonade.',
      },
      {
        category: 'Potassium Electrolyte Warning',
        foodOrDrink: 'Potassium Salt Substitutes (No-Salt, Morton Lite Salt)',
        riskLevel: 'moderate',
        interactsWith: ['Lisinopril'],
        explanation: 'Lisinopril inhibits aldosterone, causing potassium retention in the kidneys. Consuming potassium-based salt substitutes or potassium supplements can trigger hyperkalemia and dangerous cardiac arrhythmias.',
        safeAlternative: 'Herbal seasonings (Mrs. Dash), lemon pepper, garlic, or black pepper.',
      },
      {
        category: 'Alcohol Warning',
        foodOrDrink: 'Alcoholic Beverages (Beer, Wine, Spirits)',
        riskLevel: 'moderate',
        interactsWith: ['Metoprolol Succinate', 'Lisinopril', 'Atorvastatin'],
        explanation: 'Alcohol enhances peripheral vasodilation, precipitating acute orthostatic hypotension, dizziness, and syncope. Also increases hepatic stress with daily statin therapy.',
        safeAlternative: 'Sparkling mineral water with lime or non-alcoholic mocktails.',
      },
    ],
    emergencyTriggers: [
      {
        symptoms: ['Chest pain', 'Crushing pressure in chest', 'Shortness of breath', 'Radiating pain to left jaw or arm'],
        action: 'Call 911 immediately. Chew one regular adult aspirin (325 mg) if advised by 911 dispatcher.',
        urgency: 'immediate_911',
      },
      {
        symptoms: ['Swelling of face, lips, tongue, or throat', 'Difficulty swallowing or breathing'],
        action: 'Suspected angioedema from ACE inhibitor. Call 911 or go immediately to the Emergency Room.',
        urgency: 'immediate_911',
      },
      {
        symptoms: ['Severe nausea or persistent vomiting', 'Inability to keep medications down for more than 12 hours', 'Dizziness when standing'],
        action: 'Contact ScriptCare 24/7 Clinical Pharmacy Hotline or visit ScriptCare Urgent Care (0.6 miles away).',
        urgency: 'urgent_care',
      },
    ],
  },
  {
    id: 'consult-santos-02',
    patientId: 'PT-9410',
    patientName: 'Maria Santos',
    patientAge: 54,
    patientGender: 'Female',
    pharmacistName: 'Dr. Sarah Jenkins, PharmD, BCPS',
    pharmacistTitle: 'Clinical Specialist in Ambulatory Care',
    consultationDate: 'November 2, 2026',
    pharmacyName: 'ScriptCare Clinical Pharmacy & Wellness',
    pharmacyPhone: '(555) 727-4781',
    clinicalSummary: 'Comprehensive diabetes and cardiovascular risk counseling for newly diagnosed Type 2 Diabetes with dyslipidemia. Patient was prescribed Metformin XR 1000 mg daily and Glipizide 5 mg. Focus on preventing GI upset with evening meal, recognizing hypoglycemia signs, carrying glucose tablets, and completely avoiding alcohol binge due to lactic acidosis risk.',
    rawTranscript: `PHARMACIST (Dr. Jenkins): Hello Maria, welcome! We have two key medications today to help bring your blood sugar into a healthy range, plus your cholesterol protector.

MARIA: Hi Dr. Jenkins. My sister took Metformin and told me it made her stomach really upset and nauseous. I'm a little nervous about that.

PHARMACIST: I'm so glad you brought that up! Gastrointestinal upset is the most common reason people stop Metformin, but we can almost completely prevent it with two simple rules:
Rule number one: We are giving you the "Extended Release" version (Metformin XR).
Rule number two: You MUST take your Metformin 1000 mg in the evening with your largest meal of the day (usually dinner). Never take it on an empty stomach. Having food in your stomach acts as a cushion and slows absorption. If you ever feel mild nausea during the first week, don't panic—it usually subsides within 7 to 10 days. But if the nausea is severe, or if you ever feel unusually exhausted, cold, or have trouble breathing, contact us immediately because excessive alcohol or kidney issues can trigger a rare but dangerous condition called lactic acidosis. So zero heavy alcohol on Metformin.

MARIA: Okay, Metformin with my biggest dinner meal. What about the second diabetes pill?

PHARMACIST: That is Glipizide 5 mg. Glipizide works by stimulating your pancreas to release insulin right when you eat. Because of how it works, you must take Glipizide exactly 30 minutes BEFORE your breakfast. Never take Glipizide if you are skipping breakfast, because without food, your blood sugar will drop too low (hypoglycemia). Keep fast-acting glucose tablets, 4 ounces of fruit juice, or hard candies in your purse just in case you feel shaky, sweaty, or confused.

And finally, Atorvastatin 20 mg: take this with dinner as well. Remember our golden rule: absolutely no grapefruit or grapefruit juice!

MARIA: Thank you so much for explaining why timing and food matter so much!`,
    medications: [
      {
        id: 'med-metformin-xr',
        medicationName: 'Metformin XR',
        genericName: 'Metformin Hydrochloride Extended-Release',
        brandName: 'Glucophage XR',
        strength: '1000 mg',
        dosageForm: 'Extended-release oral tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily with dinner',
        timeOfDay: ['evening'],
        targetTime: '18:30',
        withFood: 'with_food',
        foodInstructions: 'Always take with your largest evening meal. Swallow whole with a full glass of water. Never take on empty stomach.',
        purpose: 'Glycemic control & insulin sensitivity improvement',
        pharmacistAdvice: 'Take with dinner. Taking on an empty stomach triggers nausea and cramps. Avoid binge drinking alcohol to prevent lactic acidosis.',
        warnings: [
          'FDA Black Box Warning: Lactic Acidosis (Avoid alcohol, caution with renal illness)',
          'Always take with food to prevent severe nausea & watery diarrhea',
          'Swallow whole: do not break, chew, or crush',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: 'WARNING: LACTIC ACIDOSIS',
        refillsRemaining: 4,
        nextRefillDate: 'December 2, 2026',
        pillColor: 'White',
        pillShape: 'Oblong',
        imprint: 'XR 1000',
      },
      {
        id: 'med-glipizide-5',
        medicationName: 'Glipizide',
        genericName: 'Glipizide',
        brandName: 'Glucotrol',
        strength: '5 mg',
        dosageForm: 'Oral tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily 30 minutes before breakfast',
        timeOfDay: ['morning'],
        targetTime: '07:30',
        withFood: 'special',
        foodInstructions: 'Take strictly 30 minutes BEFORE breakfast. Do NOT take if you plan to skip the meal.',
        purpose: 'Stimulates pancreatic beta-cell insulin secretion for mealtime blood sugar control',
        pharmacistAdvice: 'Take 30 minutes before breakfast. Always have meal ready. Carry glucose tablets in case of shaky hypoglycemia.',
        warnings: [
          'Risk of Hypoglycemia (shakiness, sweating, lightheadedness)',
          'Never take on an empty stomach if skipping meal',
          'Carry fast-acting carbs or glucose tablets',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: null,
        refillsRemaining: 4,
        nextRefillDate: 'December 2, 2026',
        pillColor: 'Light Blue',
        pillShape: 'Round scored',
        imprint: 'GLIP 5',
      },
      {
        id: 'med-atorvastatin-20',
        medicationName: 'Atorvastatin',
        genericName: 'Atorvastatin Calcium',
        brandName: 'Lipitor',
        strength: '20 mg',
        dosageForm: 'Oral film-coated tablet',
        doseAmount: '1 tablet',
        frequency: 'Once daily with dinner',
        timeOfDay: ['evening'],
        targetTime: '18:30',
        withFood: 'with_food',
        foodInstructions: 'Take with dinner. Completely avoid grapefruit and grapefruit juice.',
        purpose: 'Primary cardiovascular risk reduction in diabetes',
        pharmacistAdvice: 'Take with evening meal. Strict ban on grapefruit products. Report severe muscle soreness.',
        warnings: [
          'Contraindicated with Grapefruit products',
          'Report muscle tenderness or weakness',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: null,
        refillsRemaining: 4,
        nextRefillDate: 'December 2, 2026',
        pillColor: 'White',
        pillShape: 'Elliptical',
        imprint: 'ATV 20',
      },
    ],
    generalDietaryWarnings: [
      {
        category: 'Severe Toxicity Warning',
        foodOrDrink: 'Grapefruit & Grapefruit Juice',
        riskLevel: 'severe',
        interactsWith: ['Atorvastatin'],
        explanation: 'Inhibits intestinal CYP3A4 metabolism leading to accumulation of Atorvastatin and severe risk of rhabdomyolysis.',
        safeAlternative: 'Fresh strawberries, apples, blueberries, or water with lemon.',
      },
      {
        category: 'Metabolic & Lactic Acidosis Risk',
        foodOrDrink: 'Binge Drinking & Alcohol',
        riskLevel: 'severe',
        interactsWith: ['Metformin XR', 'Glipizide'],
        explanation: 'Alcohol potentiates Metformin risk of fatal lactic acidosis and simultaneously blocks hepatic gluconeogenesis, causing severe and prolonged hypoglycemia with Glipizide.',
        safeAlternative: 'Zero-proof mocktails or flavored seltzer.',
      },
    ],
    emergencyTriggers: [
      {
        symptoms: ['Hypoglycemia: Shakiness, extreme sweating, confusion, dizziness, slurred speech'],
        action: 'Rule of 15: Take 15 grams of fast carbs (3-4 glucose tablets or 4 oz juice). Wait 15 mins and recheck. If unconscious, call 911.',
        urgency: 'immediate_911',
      },
      {
        symptoms: ['Severe nausea, intractable vomiting, rapid deep breathing, extreme weakness'],
        action: 'Possible lactic acidosis or severe dehydration. Proceed to nearest Urgent Care or Emergency Department.',
        urgency: 'urgent_care',
      },
    ],
  },
  {
    id: 'consult-miller-03',
    patientId: 'PT-7193',
    patientName: 'David Miller',
    patientAge: 38,
    patientGender: 'Male',
    pharmacistName: 'Dr. Sarah Jenkins, PharmD, BCPS',
    pharmacistTitle: 'Clinical Specialist in Ambulatory Care',
    consultationDate: 'November 4, 2026',
    pharmacyName: 'ScriptCare Clinical Pharmacy & Wellness',
    pharmacyPhone: '(555) 727-4781',
    clinicalSummary: 'Outpatient acute bacterial infection management with high-dose Amoxicillin-Clavulanate (Augmentin) 875/125 mg twice daily for 10 days. Counseling focused on taking at the very start of meals to prevent clavulanate-induced GI cramping and diarrhea, separating dietary calcium/probiotics by 2 hours, and completing the full 10-day regimen.',
    rawTranscript: `PHARMACIST (Dr. Jenkins): Hi David, here is your antibiotic prescription for Amoxicillin-Clavulanate 875/125 mg, also known as Augmentin.

DAVID: Thanks Dr. Jenkins. Last time I had an antibiotic my stomach was really upset. Any tips?

PHARMACIST: Yes, Augmentin has an ingredient called clavulanate which is great at killing stubborn bacteria, but it can trigger nausea and loose stools if taken incorrectly. The golden rule with Augmentin is to take it right at the very first bite of your meal—one tablet at breakfast, and one tablet at dinner, roughly 12 hours apart. Having food in your stomach right as the tablet breaks down prevents nausea.

Also, if you eat yogurt or take probiotic supplements to protect your gut flora, do NOT take them at the exact same minute as your Augmentin. Separate yogurt or probiotics by at least 2 to 3 hours, otherwise the antibiotic will simply wipe out the beneficial bacteria in the yogurt.

And most importantly: finish all 10 days, even if you feel 100% better on day 4. Stopping early breeds antibiotic-resistant bacteria.

DAVID: Understood. First bite of breakfast and dinner, space yogurt out by 2 hours, finish all 10 days!`,
    medications: [
      {
        id: 'med-augmentin-875',
        medicationName: 'Amoxicillin-Clavulanate',
        genericName: 'Amoxicillin and Clavulanate Potassium',
        brandName: 'Augmentin',
        strength: '875/125 mg',
        dosageForm: 'Film-coated oral tablet',
        doseAmount: '1 tablet',
        frequency: 'Twice daily every 12 hours with meals',
        timeOfDay: ['morning', 'evening'],
        targetTime: '08:00',
        withFood: 'with_food',
        foodInstructions: 'Take right at the very first bite of breakfast and dinner. Separate yogurt and probiotic foods by at least 2 to 3 hours.',
        purpose: 'Eradication of bacterial respiratory infection',
        pharmacistAdvice: 'Take at the start of meals to prevent nausea and cramping. Complete all 10 days without skipping.',
        warnings: [
          'Must complete full 10-day course even if feeling better',
          'Take with meal to avoid severe diarrhea or stomach upset',
          'Separate probiotics and yogurt by 2-3 hours',
          'Seek emergency care if hives, lip swelling, or breathing difficulty develops (Penicillin allergy)',
        ],
        fdaSchedule: 'Rx-Only (Legend Drug)',
        blackBoxWarning: null,
        refillsRemaining: 0,
        nextRefillDate: 'Course completed Nov 14, 2026',
        pillColor: 'White',
        pillShape: 'Oval / Capsule shaped',
        imprint: 'AUG 875',
      },
    ],
    generalDietaryWarnings: [
      {
        category: 'Absorption & Efficacy Warning',
        foodOrDrink: 'Probiotics, Yogurt & Kefir',
        riskLevel: 'advisory',
        interactsWith: ['Amoxicillin-Clavulanate'],
        explanation: 'Antibiotics kill the active beneficial bacterial cultures in yogurt and probiotic drinks if consumed concurrently.',
        safeAlternative: 'Consume yogurt or probiotic kefir at least 2 to 3 hours after taking your Augmentin tablet.',
      },
    ],
    emergencyTriggers: [
      {
        symptoms: ['Hives', 'Generalized itchy red skin rash', 'Swelling of throat or lips', 'Wheezing'],
        action: 'Immediate Penicillin Anaphylaxis Alert: Call 911 immediately and discontinue medication.',
        urgency: 'immediate_911',
      },
    ],
  },
];
