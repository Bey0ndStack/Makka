export const chequeStatusLabels = {
  ar: { PENDING: "تحت التحصيل", CLEARED: "تم الصرف", BOUNCED: "مرتجع" },
  en: { PENDING: "Pending", CLEARED: "Cleared", BOUNCED: "Bounced" }
} as const;

export const chequeStatusClasses = {
  PENDING: "bg-amber-50 text-amber-700",
  CLEARED: "bg-emerald-50 text-emerald-700",
  BOUNCED: "bg-rose-50 text-rose-700"
} as const;
