import { CVData } from "./types";

export const PROFILE = {
  name: "Christzele N. Siao",
  contact: {
    phone: "+63 9692409507",
    email: "siaochristzele@gmail.com",
    location: "Sibulan, Negros Oriental, Philippines",
    github: "",
    linkedin: "",
    website: "",
  },
  education: [
    {
      degree: "Bachelor of Business Administration — Major in Management",
      institution: "Silliman University, Dumaguete City",
      period: "2012 – 2016",
      note: "College of Business Administration",
    },
    {
      degree: "Secondary Education",
      institution: "Negros Oriental High School, Dumaguete City",
      period: "2008 – 2012",
    },
  ],
  experience: [
    {
      role: "Assistant Restaurant Manager III",
      company: "Freemont Foods Corporation — Jollibee",
      location: "Dumaguete City, Negros Oriental",
      period: "April 2022 – Present",
      bullets: [
        "Lead floor operations for a high-volume QSR — overseeing crew scheduling, Food Safety & Sanitation compliance, and service quality across 200+ daily covers",
        "Appointed Drive-Thru & Delivery Manager (2025) and Marketing Manager (2023); optimised turnaround time and implemented service speed programmes reducing peak wait time",
        "Train, certify, and performance-appraise 10+ crew members using Jollibee's Crew Training System; conduct Personal Customer Surveys and raise CAPs on service deviations",
        "Manage Repair & Maintenance and utility cost tracking during shifts; coordinate game plans, crew discipline, and machine breakdown communications to senior management",
        "Ensure FIFO/FEFO compliance, inventory accuracy, and highest-level Food Safety Cleanliness (FSC) scores through proactive travel-path audits and spot checks",
      ],
    },
    {
      role: "Manager / Proprietor",
      company: "Siao's Mini Mart",
      location: "Sibulan, Negros Oriental",
      period: "July 2020 – April 2022",
      bullets: [
        "Founded and independently operated a community retail mini-mart — managing procurement, stock rotation, cash reconciliation, and daily sales targets",
        "Maintained inventory using FIFO principles, reducing wastage and ensuring consistent product availability for the local customer base",
        "Handled all administrative and financial operations including bookkeeping, supplier relations, and daily P&L tracking",
      ],
    },
    {
      role: "Customer Service Associate",
      company: "Amazon Philippines",
      location: "Cebu City",
      period: "August 2019 – June 2020",
      bullets: [
        "Handled 50+ daily customer enquiries via CRM platforms; resolved escalated complaints within SLA targets, consistently achieving high customer satisfaction scores",
        "Identified customer concerns, triaged cases, and coordinated resolution with specialist teams, minimising repeat contacts and escalations",
      ],
    },
    {
      role: "Sales and Marketing Associate",
      company: "Appco Group Asia",
      location: "Makati City",
      period: "June 2018 – January 2019",
      bullets: [
        "Executed direct sales campaigns and client acquisition drives, consistently meeting monthly revenue and new-account targets",
        "Developed product knowledge and customer engagement skills in a fast-paced, target-driven sales environment",
      ],
    },
    {
      role: "Accounts Receivable Associate",
      company: "Accenture Philippines",
      location: "Mandaluyong City",
      period: "March 2017 – June 2018",
      bullets: [
        "Processed high-volume accounts receivable transactions with 99%+ accuracy; coordinated with finance teams to resolve billing disputes and reduce outstanding balances",
        "Maintained detailed records and documentation in compliance with company financial controls and audit requirements",
      ],
    },
    {
      role: "Customer Service Representative",
      company: "Convergys",
      location: "Mandaluyong City",
      period: "July 2016 – February 2017",
      bullets: [
        "Served as frontline concierge, triaging and routing 80+ daily customer enquiries to specialist teams with minimal transfer errors",
        "Identified primary customer concerns through active listening and routed them accurately, contributing to first-contact resolution metrics",
      ],
    },
  ],
  skills: {
    operations: [
      "Restaurant Operations",
      "QSR Management",
      "Drive-Thru & Delivery",
      "Shift Management",
      "Floor Supervision",
    ],
    foodSafety: [
      "Food Safety & Hygiene",
      "HACCP",
      "FIFO / FEFO",
      "Sanitation & C&S Compliance",
      "Pest Awareness",
    ],
    peopleManagement: [
      "Team Leadership",
      "Crew Training & Certification",
      "Staff Scheduling",
      "Performance Appraisal",
      "Coaching & Mentoring",
    ],
    customerService: [
      "Customer Service",
      "Complaint Handling",
      "Service Recovery",
      "Customer Satisfaction",
      "CRM",
    ],
    businessAdmin: [
      "Inventory Management",
      "Cost Management",
      "Sales Target Achievement",
      "Cash Handling & Reconciliation",
      "MS Office (Word, Excel, PowerPoint)",
    ],
    languages: ["English (Fluent)", "Filipino (Native)"],
  },
  achievements: [
    {
      name: "Siao's Mini Mart",
      description:
        "Founded and operated an independent community retail business; managed end-to-end procurement, inventory control, cash flow, and customer relations over two years",
    },
    {
      name: "Drive-Thru & Delivery Optimisation — Jollibee",
      description:
        "Appointed Drive-Thru & Delivery Manager (Jan 2025); restructured service flow and crew deployment to improve order turnaround time and delivery accuracy during peak hours",
    },
    {
      name: "Crew Training & Certification Programme",
      description:
        "Designed and implemented a structured crew training system certifying staff across all service phases; raised team FSC compliance scores and reduced onboarding time",
    },
  ],
  certifications: [
    "Food Handlers Course — City Health Office of Dumaguete (April 2022)",
    "Jollibee Basic Operation Training Programme (Phases 1–6) (April–July 2022)",
    "iCare eLearning: Cash Control System, Inventory & Novelty Management — Jollibee (November 2022)",
    "Food Safety Programme — Jollibee (January 2023)",
    "Pest Awareness Training: Stay One Step Ahead of Pests — Jollibee (January 2023)",
  ],
};

// Fallback CV (used if AI call fails — ensures the app still renders something useful)
export const FALLBACK_CV: CVData = {
  name: PROFILE.name,
  tagline: "Assistant Restaurant Manager | QSR Operations & Team Leadership",
  contact: PROFILE.contact,
  summary:
    "Results-driven Assistant Restaurant Manager with 3+ years at Jollibee, leading floor operations, crew training, and Food Safety compliance for a high-volume QSR. Proven track record across restaurant management, retail ownership, and customer service, with strong leadership, FIFO/FEFO discipline, and consistent sales target achievement.",
  skills: [
    { category: "Restaurant Operations", items: PROFILE.skills.operations },
    { category: "Food Safety & Compliance", items: PROFILE.skills.foodSafety },
    { category: "People Management", items: PROFILE.skills.peopleManagement },
    { category: "Customer Service", items: PROFILE.skills.customerService },
    { category: "Business & Admin", items: PROFILE.skills.businessAdmin },
  ],
  experience: PROFILE.experience.slice(0, 3),
  education: PROFILE.education,
  projects: PROFILE.achievements,
  certifications: PROFILE.certifications,
};
