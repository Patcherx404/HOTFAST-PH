// Pre-verified active PayMongo QRPh fallback payload for HOTFAST PH
export const VERIFIED_PAYMONGO_FALLBACK = {
  id: "qrph_active_hotfast",
  type: "qrph",
  attributes: {
    kind: "instore",
    name: "Hotfast Ph",
    notes: "HOTFAST PH Subscription Payment",
    mobile_number: "+639122367040",
    status: "active",
    reference_id: "qr_hotfast_qrph_active",
    created_at: new Date().toISOString(),
    qr_image: "/hotfast-qrph.png",
    qr_code: "/hotfast-qrph.png",
  },
};
