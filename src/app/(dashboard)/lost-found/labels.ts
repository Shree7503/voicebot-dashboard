/** Item types the bot records (lostFound.group), in English and Marathi. */
const ITEMS: Record<string, string> = {
  phone: "Phone · फोन",
  wallet: "Wallet · पाकीट",
  jewellery: "Jewellery · दागिने",
  footwear: "Footwear · पादत्राणे",
  bag: "Bag · बॅग",
  documents: "Documents · कागदपत्रे",
  vehicle: "Vehicle · वाहन",
  other: "Other · इतर",
};

/** "Phone · फोन", or just "Phone" where space is tight. */
export function itemLabel(item: string | null, withMarathi = true): string {
  if (!item) return "Not given";
  const label = ITEMS[item];
  if (!label) return item.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return withMarathi ? label : label.split(" · ")[0];
}

/** Status in plain words: returned or closed, a match waiting to be checked, or open. */
export function statusOf(r: { state: string | null; caseStatus: string | null; match: unknown }): { label: string; style: string } {
  if (r.state === "returned") return { label: "Returned", style: "bg-success/15 text-success" };
  if (r.caseStatus === "closed" || (r.state && r.state !== "open")) return { label: "Closed", style: "bg-surface-raised text-foreground-dim" };
  if (r.match) return { label: "Match to check", style: "bg-p2-bg text-p2" };
  return { label: "Open", style: "bg-accent/10 text-accent" };
}
