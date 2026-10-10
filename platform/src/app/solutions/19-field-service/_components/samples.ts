/**
 * Demo input only (not model output): what Arun Pillai dictated at the end of his visit to CH-02 on 11 Oct 2026,
 * as captured by the phone's speech-to-text. Presenters can use it when a microphone is not available.
 */
export const ARUN_NOTE = `Job 4471, CH-02 Al Ghaf. Arrived 07:40, met Salem at security. Permit PTW-AGCC-26-0412 issued by Rafiq for roof plant. CH-02 circuit B in lockout, alarm A21, log shows three trips 14:05, 14:21, 14:37 on the 9th. Ambient 33 degrees at 08:00.
Before cleaning, ran circuit B on CH-02 at about 70 percent load: discharge 1,640 kPa, sat condensing 63 degrees so approach about 30 K, way too high. Subcooling 6 K, suction superheat 7 K. CHW leaving 7.9.
Condenser coil heavily fouled, dust and feathers, grease film on the west face near the kitchen exhaust outlet.
Isolated per LOTO: main isolator Q1 and both fan isolators, locked and tagged, proved dead, fan blades restrained. Covered the control panel.
Cleaned circuit A and B coils with the pH neutral foam, took 2 cans RFM-CHM-0112 from the site store B1-07, low pressure rinse with the wash pump from the van, combed bent fins on circuit B, maybe 3 percent of the face. Did NOT use the alkaline cleaner in the van.
Fan CB-F5 bearing rumbling, vibration pen 6.8 mm/s, motor body 78 degrees, current 5.6 A. Other fans 4.6 to 4.9 A. No replacement motor ACX-FM-0922 in the van and store shows zero. Fan left running, monitor. Need follow-up to replace motor.
Discharge transducer checked against gauge, within 20 kPa.
Removed locks 10:50, reset lockout 10:55, chiller back on line. After 40 minutes at about 75 percent load: discharge 1,180 kPa, sat condensing 47, approach 14 K, CHW leaving 7.3. No trips.
Customer Salem Al Remeithi, centre manager, signed off 11:40. Left site 11:50.
Recommend coil cleaning monthly from April to October for CH-02 and ask MNDA about moving the kitchen exhaust discharge away from the chiller.`;

export const ASK_SUGGESTIONS = [
  { en: "What condenser approach is normal at full load?", ar: "ما فرق الاقتراب الطبيعي للمكثف عند الحمل الكامل؟" },
  { en: "Can I use the alkaline coil cleaner on CH-02?", ar: "هل يمكنني استخدام المنظف القلوي على ملفات CH-02؟" },
  { en: "Which isolation points for the condenser fans?", ar: "ما نقاط العزل لمراوح المكثف؟" },
  { en: "Fan bearing is noisy — can I keep it running?", ar: "صوت محمل المروحة مرتفع — هل يمكن إبقاؤها تعمل؟" },
];
