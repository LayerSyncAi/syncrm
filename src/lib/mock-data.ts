export const currentUser = {
  id: "user_admin_1",
  fullName: "Amara Chen",
  role: "admin",
};

export const stageSummary = [
  { id: "stage-1", name: "Prospect", count: 12, percent: 0.42 },
  { id: "stage-2", name: "Contacted", count: 8, percent: 0.32 },
  { id: "stage-3", name: "Viewing Scheduled", count: 5, percent: 0.18 },
  { id: "stage-4", name: "Negotiation", count: 3, percent: 0.12 },
];

export const leads = [
  {
    id: "lead-1",
    name: "Kudzai Moyo",
    phone: "+263 77 123 4567",
    stage: "Prospect",
    updated: "Today, 10:12",
  },
  {
    id: "lead-2",
    name: "Rudo Ncube",
    phone: "+263 71 555 3388",
    stage: "Viewing Scheduled",
    updated: "Yesterday, 16:20",
  },
  {
    id: "lead-3",
    name: "Tinashe Chirwa",
    phone: "+263 77 222 9911",
    stage: "Negotiation",
    updated: "Mar 12, 09:12",
  },
];

export const properties = [
  {
    id: "property-1",
    title: "Borrowdale Villa",
    type: "House",
    listing: "Sale",
    price: "$320,000",
    currency: "USD",
    location: "Borrowdale, Harare",
    area: "280",
    status: "Available",
  },
  {
    id: "property-2",
    title: "Avondale Garden Apartment",
    type: "Apartment",
    listing: "Rent",
    price: "$1,200",
    currency: "USD",
    location: "Avondale, Harare",
    area: "120",
    status: "Under Offer",
  },
];

export const tasks = [
  {
    id: "task-1",
    date: "Mar 18, 09:30",
    title: "Viewing follow-up call",
    lead: "Rudo Ncube",
  },
  {
    id: "task-2",
    date: "Mar 19, 14:00",
    title: "Send offer summary",
    lead: "Tinashe Chirwa",
  },
];

export const users = [
  {
    id: "user-1",
    name: "Amara Chen",
    email: "amara@agency.com",
    role: "Admin",
    active: true,
  },
  {
    id: "user-2",
    name: "Tafadzwa Gondo",
    email: "tafadzwa@agency.com",
    role: "Agent",
    active: true,
  },
];

export const stages = [
  {
    id: "stage-1",
    order: 1,
    name: "Prospect",
    terminal: false,
    outcome: "-",
  },
  {
    id: "stage-2",
    order: 2,
    name: "Contacted",
    terminal: false,
    outcome: "-",
  },
  {
    id: "stage-3",
    order: 5,
    name: "Closed Won",
    terminal: true,
    outcome: "won",
  },
];
