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
    contactId: "contact-1",
    propertyId: "property-1",
    ownerId: "user-2",
    stage: "Prospect",
    updated: "Today, 10:12",
  },
  {
    id: "lead-2",
    contactId: "contact-2",
    propertyId: "property-2",
    ownerId: "user-2",
    stage: "Viewing Scheduled",
    updated: "Yesterday, 16:20",
  },
  {
    id: "lead-3",
    contactId: "contact-3",
    propertyId: "property-1",
    ownerId: "user-1",
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
    images: [
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
    ],
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
    images: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
    ],
  },
];

export const contacts = [
  {
    id: "contact-1",
    name: "Kudzai Moyo",
    phone: "+263 77 123 4567",
    email: "kudzai@email.com",
    ownerId: "user-2",
  },
  {
    id: "contact-2",
    name: "Rudo Ncube",
    phone: "+263 71 555 3388",
    email: "rudo@email.com",
    ownerId: "user-2",
  },
  {
    id: "contact-3",
    name: "Tinashe Chirwa",
    phone: "+263 77 222 9911",
    email: "tinashe@email.com",
    ownerId: "user-1",
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
