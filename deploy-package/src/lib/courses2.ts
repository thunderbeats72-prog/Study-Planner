import type { Course, SeedSubject } from "./curriculum";

const s = (
  name: string,
  units: number,
  difficulty: "Easy" | "Medium" | "Hard",
  color: string
): SeedSubject => ({ name, units, difficulty, color });

const P = "#8b5cf6", B = "#3b82f6", G = "#10b981", O = "#f59e0b",
  R = "#ef4444", C = "#06b6d4", PK = "#ec4899", L = "#84cc16";

const c = (id: string, name: string, level: string, subjects: SeedSubject[]): Course => ({
  id, name, level, subjects,
});

export const EXTRA_COURSES: Course[] = [
  /* ---------- SCHOOL: every class ---------- */
  c("class_1", "Class 1 (Primary)", "school", [
    s("English", 6, "Easy", P), s("Mathematics", 6, "Easy", B),
    s("Environmental Studies", 5, "Easy", G), s("Hindi", 5, "Easy", O),
  ]),
  c("class_2", "Class 2 (Primary)", "school", [
    s("English", 6, "Easy", P), s("Mathematics", 7, "Easy", B),
    s("Environmental Studies", 6, "Easy", G), s("Hindi", 5, "Easy", O),
  ]),
  c("class_3", "Class 3 (Primary)", "school", [
    s("English", 7, "Easy", P), s("Mathematics", 8, "Easy", B),
    s("Environmental Studies", 7, "Easy", G), s("Hindi", 6, "Easy", O),
    s("Computer Basics", 4, "Easy", C),
  ]),
  c("class_4", "Class 4 (Primary)", "school", [
    s("English", 7, "Easy", P), s("Mathematics", 8, "Medium", B),
    s("Environmental Science", 7, "Easy", G), s("Hindi", 6, "Easy", O),
  ]),
  c("class_6", "Class 6 (Middle School)", "school", [
    s("Mathematics", 9, "Medium", B), s("Science", 9, "Medium", G),
    s("Social Science", 8, "Easy", O), s("English", 7, "Easy", P), s("Hindi", 6, "Easy", PK),
  ]),
  c("class_7", "Class 7 (Middle School)", "school", [
    s("Mathematics", 10, "Medium", B), s("Science", 10, "Medium", G),
    s("Social Science", 9, "Medium", O), s("English", 8, "Easy", P), s("Hindi", 6, "Easy", PK),
  ]),
  c("class_9", "Class 9 (Foundation for Boards)", "school", [
    s("Mathematics", 12, "Hard", B), s("Science", 12, "Hard", G),
    s("Social Science", 11, "Medium", O), s("English", 9, "Medium", P),
    s("Information Technology", 5, "Easy", C),
  ]),
  c("class_11_pcm", "Class 11 — Science (PCM)", "school", [
    s("Physics", 13, "Hard", B), s("Chemistry", 13, "Hard", G),
    s("Mathematics", 13, "Hard", P), s("English Core", 8, "Easy", O),
  ]),
  c("class_11_pcb", "Class 11 — Science (PCB)", "school", [
    s("Physics", 13, "Hard", B), s("Chemistry", 13, "Hard", G),
    s("Biology", 12, "Hard", L), s("English Core", 8, "Easy", O),
  ]),
  c("class_11_commerce", "Class 11 — Commerce", "school", [
    s("Accountancy", 11, "Hard", B), s("Business Studies", 10, "Medium", G),
    s("Economics", 10, "Medium", O), s("Mathematics", 11, "Hard", P),
    s("English Core", 8, "Easy", PK),
  ]),
  c("class_12_arts", "Class 12 — Humanities / Arts", "school", [
    s("History", 10, "Medium", O), s("Political Science", 10, "Medium", B),
    s("Geography", 10, "Medium", G), s("Psychology", 9, "Medium", P),
    s("English Core", 8, "Easy", PK),
  ]),

  /* ---------- DIPLOMA ---------- */
  c("diploma_civil", "Diploma in Civil Engineering", "diploma", [
    s("Building Materials & Construction", 8, "Medium", O),
    s("Strength of Materials", 8, "Hard", B),
    s("Surveying", 7, "Medium", G), s("Concrete Technology", 7, "Medium", P),
    s("Estimating & Costing", 6, "Medium", C),
  ]),
  c("diploma_electrical", "Diploma in Electrical Engineering", "diploma", [
    s("Basic Electrical Engineering", 8, "Medium", B),
    s("Electrical Machines", 8, "Hard", O), s("Power Systems", 7, "Hard", R),
    s("Electrical Measurements", 6, "Medium", G), s("Control Systems", 6, "Hard", P),
  ]),
  c("iti_electrician", "ITI — Electrician Trade", "diploma", [
    s("Trade Theory", 8, "Medium", B), s("Wiring & Installation", 7, "Medium", O),
    s("Electrical Machines Practical", 6, "Medium", G), s("Workshop Calculation & Science", 6, "Medium", P),
    s("Engineering Drawing", 5, "Easy", C),
  ]),
  c("polytechnic_it", "Polytechnic — Information Technology", "diploma", [
    s("Programming Fundamentals", 8, "Medium", B), s("Data Structures", 7, "Hard", P),
    s("Database Management", 7, "Medium", G), s("Networking Essentials", 6, "Medium", C),
    s("Software Engineering", 6, "Medium", O),
  ]),

  /* ---------- UNDERGRADUATE ---------- */
  c("btech_mech", "B.Tech Mechanical Engineering", "ug", [
    s("Engineering Mechanics", 9, "Hard", B), s("Thermodynamics", 9, "Hard", R),
    s("Fluid Mechanics", 8, "Hard", C), s("Strength of Materials", 8, "Hard", O),
    s("Theory of Machines", 8, "Hard", P), s("Manufacturing Technology", 7, "Medium", G),
  ]),
  c("btech_civil", "B.Tech Civil Engineering", "ug", [
    s("Structural Analysis", 9, "Hard", B), s("Geotechnical Engineering", 8, "Hard", O),
    s("Fluid Mechanics & Hydraulics", 8, "Hard", C),
    s("Transportation Engineering", 7, "Medium", G),
    s("Environmental Engineering", 7, "Medium", L),
  ]),
  c("btech_ece", "B.Tech Electronics & Communication", "ug", [
    s("Signals & Systems", 9, "Hard", B), s("Analog Electronics", 8, "Hard", O),
    s("Digital Electronics", 8, "Medium", G), s("Communication Systems", 9, "Hard", P),
    s("Electromagnetic Field Theory", 8, "Hard", R),
  ]),
  c("btech_eee", "B.Tech Electrical Engineering", "ug", [
    s("Electrical Machines", 9, "Hard", O), s("Power Systems", 9, "Hard", R),
    s("Control Systems", 8, "Hard", P), s("Power Electronics", 8, "Hard", B),
    s("Network Theory", 8, "Hard", C),
  ]),
  c("bsc_cs", "B.Sc Computer Science", "ug", [
    s("Programming in C", 8, "Medium", B), s("Data Structures", 9, "Hard", P),
    s("Database Management Systems", 8, "Medium", G), s("Operating Systems", 8, "Hard", O),
    s("Computer Networks", 7, "Medium", C), s("Software Engineering", 6, "Medium", L),
  ]),
  c("bsc_chemistry", "B.Sc Chemistry", "ug", [
    s("Physical Chemistry", 9, "Hard", B), s("Organic Chemistry", 10, "Hard", G),
    s("Inorganic Chemistry", 9, "Medium", O), s("Analytical Chemistry", 7, "Medium", C),
  ]),
  c("bsc_biology", "B.Sc Biology / Life Sciences", "ug", [
    s("Cell Biology", 8, "Medium", G), s("Genetics", 8, "Hard", P),
    s("Botany", 8, "Medium", L), s("Zoology", 8, "Medium", O),
    s("Biochemistry", 8, "Hard", B), s("Microbiology", 7, "Medium", C),
  ]),
  c("bsc_maths", "B.Sc Mathematics", "ug", [
    s("Real Analysis", 9, "Hard", B), s("Abstract Algebra", 9, "Hard", P),
    s("Linear Algebra", 8, "Hard", G), s("Differential Equations", 8, "Hard", O),
    s("Probability & Statistics", 8, "Medium", C),
  ]),
  c("bsc_nursing", "B.Sc Nursing", "ug", [
    s("Anatomy", 9, "Hard", R), s("Physiology", 9, "Hard", B),
    s("Nutrition & Biochemistry", 7, "Medium", G),
    s("Nursing Foundations", 9, "Medium", P), s("Microbiology", 6, "Medium", C),
    s("Psychology", 6, "Easy", O),
  ]),
  c("bpharm", "B.Pharm — Pharmacy", "ug", [
    s("Pharmaceutics", 9, "Hard", B), s("Pharmacology", 9, "Hard", O),
    s("Pharmaceutical Chemistry", 9, "Hard", G), s("Pharmacognosy", 7, "Medium", L),
    s("Pharmaceutical Analysis", 7, "Medium", C),
  ]),
  c("bca", "BCA — Computer Applications", "ug", [
    s("Programming Fundamentals", 8, "Medium", B), s("Data Structures", 8, "Hard", P),
    s("Database Management Systems", 8, "Medium", G), s("Web Development", 7, "Medium", O),
    s("Operating Systems", 7, "Hard", C), s("Software Engineering", 6, "Medium", L),
  ]),
  c("llb", "LL.B — Bachelor of Laws", "ug", [
    s("Constitutional Law", 10, "Hard", B), s("Law of Contract", 8, "Medium", G),
    s("Criminal Law (IPC)", 9, "Hard", R), s("Law of Torts", 7, "Medium", O),
    s("Family Law", 7, "Medium", P), s("Legal Method & Research", 6, "Medium", C),
  ]),
  c("barch", "B.Arch — Architecture", "ug", [
    s("Architectural Design", 10, "Hard", P), s("Building Construction", 8, "Medium", O),
    s("History of Architecture", 7, "Medium", G), s("Structural Systems", 8, "Hard", B),
    s("Building Services", 6, "Medium", C),
  ]),
  c("ba_psychology", "B.A / B.Sc Psychology", "ug", [
    s("General Psychology", 8, "Easy", P), s("Developmental Psychology", 7, "Medium", G),
    s("Cognitive Psychology", 8, "Hard", B), s("Abnormal Psychology", 8, "Medium", R),
    s("Research Methods & Statistics", 8, "Hard", C),
  ]),
  c("ba_history", "B.A History", "ug", [
    s("Ancient Indian History", 9, "Medium", O), s("Medieval Indian History", 8, "Medium", P),
    s("Modern Indian History", 9, "Medium", B), s("World History", 8, "Medium", G),
    s("Historiography", 6, "Hard", C),
  ]),
  c("ba_polsci", "B.A Political Science", "ug", [
    s("Political Theory", 8, "Medium", B), s("Indian Government & Politics", 9, "Medium", O),
    s("Comparative Politics", 8, "Hard", P), s("International Relations", 8, "Medium", G),
    s("Public Administration", 7, "Medium", C),
  ]),
  c("bsc_data_science", "B.Sc / B.Tech Data Science", "ug", [
    s("Python Programming", 8, "Medium", B), s("Statistics", 9, "Hard", C),
    s("Machine Learning", 10, "Hard", P), s("Data Visualisation", 6, "Easy", O),
    s("Database & SQL", 7, "Medium", G), s("Big Data Systems", 7, "Hard", R),
  ]),
  c("bhm", "BHM — Hotel Management", "ug", [
    s("Food Production", 8, "Medium", O), s("Food & Beverage Service", 7, "Medium", G),
    s("Front Office Operations", 7, "Easy", B), s("Housekeeping Operations", 6, "Easy", P),
    s("Hospitality Accounting", 6, "Medium", C),
  ]),
  c("bjmc", "BJMC — Journalism & Mass Comm", "ug", [
    s("Introduction to Journalism", 7, "Easy", B), s("Reporting & Editing", 8, "Medium", O),
    s("Media Laws & Ethics", 7, "Medium", R), s("Radio & TV Production", 7, "Medium", P),
    s("Digital & Social Media", 6, "Easy", C),
  ]),
  c("bed", "B.Ed — Bachelor of Education", "ug", [
    s("Childhood & Growing Up", 7, "Medium", P), s("Learning & Teaching", 8, "Medium", B),
    s("Knowledge & Curriculum", 7, "Medium", G), s("Assessment for Learning", 7, "Medium", O),
    s("Inclusive Education", 6, "Easy", C),
  ]),

  /* ---------- POSTGRADUATE ---------- */
  c("mcom", "M.Com", "pg", [
    s("Advanced Financial Accounting", 9, "Hard", B), s("Corporate Finance", 8, "Hard", G),
    s("Business Research Methods", 7, "Medium", P), s("Advanced Taxation", 8, "Hard", O),
    s("Managerial Economics", 7, "Medium", C),
  ]),
  c("msc_physics", "M.Sc Physics", "pg", [
    s("Classical Mechanics", 8, "Hard", B), s("Quantum Mechanics", 10, "Hard", P),
    s("Electromagnetism", 9, "Hard", O), s("Statistical Mechanics", 8, "Hard", R),
    s("Solid State Physics", 8, "Hard", C),
  ]),
  c("msc_maths", "M.Sc Mathematics", "pg", [
    s("Real & Complex Analysis", 10, "Hard", B), s("Abstract Algebra", 9, "Hard", P),
    s("Topology", 8, "Hard", G), s("Functional Analysis", 8, "Hard", O),
    s("Numerical Analysis", 7, "Hard", C),
  ]),
  c("mca", "MCA — Computer Applications", "pg", [
    s("Advanced Data Structures", 9, "Hard", P), s("Operating Systems", 8, "Hard", B),
    s("Computer Networks", 8, "Medium", C), s("Software Engineering", 7, "Medium", G),
    s("Machine Learning", 8, "Hard", O),
  ]),
  c("ma_english", "M.A English", "pg", [
    s("British Literature", 9, "Medium", P), s("American Literature", 8, "Medium", B),
    s("Literary Criticism & Theory", 9, "Hard", O), s("Indian English Literature", 8, "Medium", G),
    s("Linguistics", 7, "Hard", C),
  ]),
  c("msw", "MSW — Master of Social Work", "pg", [
    s("Social Work Practice", 8, "Medium", B), s("Community Organisation", 7, "Medium", G),
    s("Social Policy & Legislation", 8, "Medium", O), s("Research Methods", 7, "Hard", P),
    s("Counselling Skills", 6, "Medium", C),
  ]),

  /* ---------- COMPETITIVE ---------- */
  c("neet_pg", "NEET PG / INI-CET", "competitive", [
    s("Medicine", 11, "Hard", B), s("Surgery", 10, "Hard", R),
    s("Obstetrics & Gynaecology", 9, "Hard", PK), s("Pathology", 8, "Hard", P),
    s("Pharmacology", 8, "Hard", O), s("Preventive & Social Medicine", 8, "Medium", G),
  ]),
  c("gate_mech", "GATE — Mechanical Engineering", "competitive", [
    s("Engineering Mathematics", 9, "Hard", R), s("Thermodynamics", 9, "Hard", O),
    s("Fluid Mechanics", 8, "Hard", C), s("Strength of Materials", 8, "Hard", B),
    s("Theory of Machines", 8, "Hard", P), s("Manufacturing", 8, "Medium", G),
  ]),
  c("gate_ece", "GATE — Electronics & Communication", "competitive", [
    s("Engineering Mathematics", 9, "Hard", R), s("Signals & Systems", 9, "Hard", B),
    s("Analog Electronics", 8, "Hard", O), s("Digital Circuits", 8, "Medium", G),
    s("Communication Systems", 9, "Hard", P), s("Electromagnetics", 7, "Hard", C),
  ]),
  c("gate_civil", "GATE — Civil Engineering", "competitive", [
    s("Engineering Mathematics", 9, "Hard", R), s("Structural Analysis", 9, "Hard", B),
    s("Geotechnical Engineering", 8, "Hard", O), s("Fluid Mechanics", 8, "Hard", C),
    s("Transportation Engineering", 7, "Medium", G),
    s("Environmental Engineering", 7, "Medium", L),
  ]),
  c("upsc_prelims", "UPSC Prelims (CSAT focus)", "competitive", [
    s("Indian Polity", 9, "Hard", B), s("History", 9, "Medium", O),
    s("Geography", 8, "Medium", G), s("Economy", 8, "Hard", P),
    s("Environment", 6, "Easy", L), s("CSAT Aptitude", 8, "Medium", C),
  ]),
  c("state_psc", "State PSC (PCS / MPSC / BPSC)", "competitive", [
    s("State-Specific GK", 9, "Medium", O), s("Indian Polity", 8, "Hard", B),
    s("History", 8, "Medium", P), s("Geography", 7, "Medium", G),
    s("Economy", 7, "Hard", C), s("Current Affairs", 8, "Medium", R),
  ]),
  c("ssc_chsl", "SSC CHSL / MTS / RRB NTPC", "competitive", [
    s("Quantitative Aptitude", 10, "Medium", B), s("Reasoning Ability", 9, "Medium", P),
    s("English Language", 8, "Medium", O), s("General Awareness", 9, "Easy", G),
  ]),
  c("bank_po", "Bank PO / Clerk (IBPS & SBI)", "competitive", [
    s("Quantitative Aptitude", 10, "Hard", B), s("Reasoning Ability", 10, "Hard", P),
    s("English Language", 8, "Medium", O), s("General & Banking Awareness", 8, "Medium", G),
    s("Computer Awareness", 5, "Easy", C),
  ]),
  c("nda", "NDA / CDS — Defence Entrance", "competitive", [
    s("Mathematics", 12, "Hard", B), s("General Science", 8, "Medium", G),
    s("History & Freedom Movement", 7, "Medium", O), s("Geography", 7, "Medium", L),
    s("Current Events & English", 7, "Medium", P),
  ]),
  c("clat", "CLAT / Law Entrance", "competitive", [
    s("Legal Reasoning", 9, "Hard", B), s("Logical Reasoning", 8, "Medium", P),
    s("English & Comprehension", 8, "Medium", O), s("Current Affairs & GK", 8, "Medium", G),
    s("Quantitative Techniques", 6, "Medium", C),
  ]),
  c("bitsat", "BITSAT / State CET (MHT-CET, KCET)", "competitive", [
    s("Physics", 13, "Hard", B), s("Chemistry", 13, "Hard", G),
    s("Mathematics", 14, "Hard", P), s("English & Logical Reasoning", 5, "Easy", O),
  ]),
  c("gre_gmat", "GRE / GMAT", "competitive", [
    s("Quantitative Reasoning", 10, "Hard", B), s("Verbal Reasoning", 9, "Hard", P),
    s("Analytical Writing", 5, "Medium", O), s("Vocabulary Building", 8, "Medium", G),
    s("Mock Test Analysis", 6, "Medium", R),
  ]),
  c("ielts_toefl", "IELTS / TOEFL / PTE", "competitive", [
    s("Listening", 7, "Medium", B), s("Reading", 7, "Medium", G),
    s("Writing Task 1 & 2", 8, "Hard", O), s("Speaking", 7, "Medium", P),
    s("Grammar & Vocabulary", 6, "Easy", C),
  ]),
  c("net_jrf", "UGC NET / JRF", "competitive", [
    s("Teaching & Research Aptitude", 9, "Medium", B),
    s("Subject Paper — Core Theory", 12, "Hard", P),
    s("Subject Paper — Applications", 10, "Hard", G),
    s("Previous Year Analysis", 6, "Medium", O),
  ]),

  /* ---------- PROFESSIONAL ---------- */
  c("ca_foundation", "CA Foundation", "professional", [
    s("Principles of Accounting", 10, "Hard", B), s("Business Laws", 8, "Medium", O),
    s("Business Mathematics & Statistics", 9, "Hard", P),
    s("Business Economics", 8, "Medium", G),
  ]),
  c("ca_final", "CA Final", "professional", [
    s("Financial Reporting", 11, "Hard", B), s("Strategic Financial Management", 10, "Hard", G),
    s("Advanced Auditing", 9, "Hard", C), s("Direct Tax Laws", 10, "Hard", O),
    s("Indirect Tax Laws", 9, "Hard", P),
  ]),
  c("cs_exec", "Company Secretary (CS Executive)", "professional", [
    s("Jurisprudence & Interpretation", 8, "Hard", B), s("Company Law", 10, "Hard", O),
    s("Setting up of Business", 7, "Medium", G), s("Tax Laws", 9, "Hard", P),
    s("Corporate & Management Accounting", 9, "Hard", C),
  ]),
  c("cma", "CMA (Cost & Management Accounting)", "professional", [
    s("Cost Accounting", 10, "Hard", P), s("Financial Accounting", 9, "Hard", B),
    s("Direct Taxation", 8, "Hard", O), s("Operations Management", 7, "Medium", G),
    s("Strategic Management", 6, "Medium", C),
  ]),
  c("cfa_l2", "CFA Level 2", "professional", [
    s("Ethics & Professional Standards", 6, "Medium", B),
    s("Financial Statement Analysis", 9, "Hard", G), s("Equity Valuation", 9, "Hard", P),
    s("Fixed Income", 8, "Hard", C), s("Derivatives & Alternatives", 8, "Hard", O),
  ]),
  c("frm", "FRM — Financial Risk Manager", "professional", [
    s("Foundations of Risk Management", 7, "Medium", B),
    s("Quantitative Analysis", 9, "Hard", P), s("Financial Markets & Products", 9, "Hard", G),
    s("Valuation & Risk Models", 9, "Hard", O),
  ]),
  c("aws_cloud", "Cloud / DevOps Certification (AWS, Azure)", "professional", [
    s("Cloud Fundamentals", 7, "Easy", B), s("Compute & Storage Services", 8, "Medium", G),
    s("Networking & Security", 8, "Hard", R), s("Infrastructure as Code", 7, "Medium", P),
    s("CI/CD & Monitoring", 7, "Medium", C),
  ]),
  c("cyber_sec", "Cybersecurity Certification (CEH / Security+)", "professional", [
    s("Security Fundamentals", 7, "Medium", B), s("Network Security", 8, "Hard", C),
    s("Cryptography", 7, "Hard", P), s("Ethical Hacking & Pen Testing", 9, "Hard", R),
    s("Governance, Risk & Compliance", 6, "Medium", G),
  ]),

  /* ---------- PhD ---------- */
  c("phd_sciences", "PhD — Sciences / Engineering", "phd", [
    s("Advanced Domain Theory", 10, "Hard", P), s("Experimental / Simulation Methods", 8, "Hard", B),
    s("Statistical Analysis of Results", 8, "Hard", G),
    s("Literature Review & Gap Analysis", 8, "Hard", O),
    s("Paper Writing & Conferences", 7, "Hard", C),
  ]),
  c("phd_humanities", "PhD — Humanities / Social Sciences", "phd", [
    s("Theoretical Frameworks", 9, "Hard", P), s("Qualitative Methodology", 8, "Hard", B),
    s("Archival & Field Research", 8, "Hard", G),
    s("Critical Literature Review", 8, "Hard", O),
    s("Thesis Argumentation & Writing", 8, "Hard", C),
  ]),

  /* ---------- NURSERY ---------- */
  c("playgroup", "Playgroup / Toddler Program", "nursery", [
    s("Sounds & First Words", 4, "Easy", P), s("Counting Fun 1-5", 3, "Easy", B),
    s("Colours & Shapes Play", 3, "Easy", G), s("Rhymes & Movement", 3, "Easy", O),
  ]),
  c("lkg", "LKG — Lower Kindergarten", "nursery", [
    s("Phonics & Letter Sounds", 5, "Easy", P), s("Numbers 1-20", 4, "Easy", B),
    s("Pattern & Shape Recognition", 4, "Easy", G), s("Picture Story & Speaking", 4, "Easy", O),
    s("Colouring & Fine Motor Skills", 3, "Easy", PK),
  ]),
];

/* Additional lesson banks for the newly added subjects. */
export const EXTRA_TOPICS: Record<string, string[]> = {
  "structural analysis": ["Types of structures & supports", "Determinacy & indeterminacy", "Trusses: method of joints", "Trusses: method of sections", "Shear force & bending moment diagrams", "Slope & deflection methods", "Moment distribution method", "Influence lines", "Matrix stiffness method"],
  "geotechnical": ["Soil formation & classification", "Index properties", "Permeability & seepage", "Effective stress principle", "Compaction & consolidation", "Shear strength of soils", "Earth pressure theories", "Bearing capacity of foundations", "Pile foundations & slope stability"],
  "fluid mechanics": ["Fluid properties & statics", "Buoyancy & floatation", "Kinematics of flow", "Bernoulli & energy equation", "Momentum equation & applications", "Laminar & turbulent flow", "Flow through pipes & losses", "Boundary layer theory", "Dimensional analysis & similitude", "Turbines & pumps"],
  "signals": ["Signal classification & operations", "LTI systems & convolution", "Fourier series", "Fourier transform", "Laplace transform", "Z-transform", "Sampling theorem", "Filters & frequency response", "State-space representation"],
  "analog electronics": ["Diodes & applications", "BJT biasing & analysis", "MOSFET operation", "Small-signal amplifiers", "Frequency response", "Feedback amplifiers", "Operational amplifiers", "Oscillators", "Power amplifiers"],
  "communication systems": ["Signals & noise fundamentals", "Amplitude modulation", "Angle modulation (FM/PM)", "Sampling & pulse modulation", "Digital modulation: ASK/FSK/PSK", "Information theory & entropy", "Error control coding", "Multiplexing & multiple access", "Wireless channel basics"],
  "electrical machines": ["Magnetic circuits & transformers", "Transformer testing & efficiency", "DC machine construction & EMF", "DC motor characteristics & starting", "Three-phase induction motor", "Induction motor testing & speed control", "Synchronous generator", "Synchronous motor & V-curves", "Special machines"],
  "power system": ["Structure of power systems", "Transmission line parameters", "Performance of transmission lines", "Load flow analysis", "Fault analysis: symmetrical", "Symmetrical components & unsymmetrical faults", "Power system stability", "Protection & relays", "Economic operation & tariffs"],
  "control system": ["System modelling & transfer functions", "Block diagrams & signal flow graphs", "Time response of 1st/2nd order systems", "Steady state error & error constants", "Routh-Hurwitz stability", "Root locus", "Bode plots & frequency response", "Nyquist criterion", "Compensators & PID design", "State space analysis"],
  "power electronics": ["Power semiconductor devices", "Diode & thyristor rectifiers", "Controlled rectifiers", "DC-DC converters (choppers)", "Inverters", "AC voltage controllers", "PWM techniques", "Drives & applications"],
  "network theory": ["Circuit elements & sources", "KCL/KVL & mesh-nodal analysis", "Network theorems", "Transient analysis (RL, RC, RLC)", "Sinusoidal steady state & phasors", "Resonance", "Two-port networks", "Network functions & Laplace methods"],
  "nursing": ["Nursing process & documentation", "Vital signs & assessment", "Infection control & asepsis", "Medication administration", "Wound care & dressing", "Patient hygiene & mobility", "Nutrition & fluid balance", "Emergency & first aid", "Ethics & communication in nursing"],
  "pharmaceutics": ["Dosage forms overview", "Preformulation studies", "Tablets & capsules", "Liquid & semisolid dosage forms", "Sterile products", "Novel drug delivery systems", "Biopharmaceutics & bioavailability", "Pharmacokinetics", "GMP & quality control"],
  "pharmaceutical chemistry": ["Structure-activity relationships", "Drug design principles", "Analysis of organic drugs", "Heterocyclic drug chemistry", "Antibiotics chemistry", "CNS drug chemistry", "Cardiovascular drug chemistry", "Stereochemistry in drug action"],
  "pharmacognosy": ["Introduction to crude drugs", "Classification of crude drugs", "Alkaloids", "Glycosides", "Volatile oils & resins", "Plant tissue culture", "Herbal formulations & standardisation"],
  "constitutional law": ["Making of the Constitution & Preamble", "Fundamental rights: Articles 12-18", "Right to freedom & life (19-22)", "Directive principles & duties", "Union executive & President", "Parliament & legislative procedure", "Judiciary & writ jurisdiction", "Federal structure & Article 356", "Emergency provisions", "Amendment & basic structure doctrine"],
  "contract": ["Formation & essentials of contract", "Offer, acceptance & consideration", "Capacity & free consent", "Void & voidable agreements", "Performance & discharge", "Breach & remedies", "Quasi contracts", "Indemnity & guarantee", "Bailment, pledge & agency"],
  "criminal law": ["General principles & elements of crime", "General exceptions", "Abetment & criminal conspiracy", "Offences against the state & public tranquillity", "Offences affecting human body", "Culpable homicide vs murder", "Offences against property", "Offences against women", "Defamation & criminal intimidation"],
  "torts": ["Nature & foundation of tort", "General defences", "Vicarious liability", "Negligence", "Strict & absolute liability", "Nuisance", "Trespass & defamation", "Consumer protection remedies"],
  "legal reasoning": ["Reading legal principles", "Applying principle to facts", "Contract-based problems", "Tort-based problems", "Criminal law problems", "Constitutional law problems", "Legal maxims & terminology", "Current legal affairs"],
  "architectural design": ["Design process & concept generation", "Site analysis & context", "Space planning & circulation", "Form, proportion & scale", "Residential design studio", "Public building design studio", "Sustainability in design", "Presentation & drafting standards"],
  "food production": ["Kitchen organisation & hygiene", "Cooking methods & heat transfer", "Stocks, soups & sauces", "Vegetable & meat cookery", "Bakery & confectionery", "Indian regional cuisine", "Continental cuisine", "Menu planning & costing"],
  "journalism": ["What is news: values & structure", "Reporting fundamentals", "Interviewing techniques", "Writing the news story", "Editing & headline writing", "Feature & opinion writing", "Media laws & ethics", "Digital journalism & SEO"],
  "teaching": ["Learner psychology & development", "Learning theories", "Lesson planning", "Teaching methods & pedagogy", "Classroom management", "Assessment & evaluation", "Inclusive & special education", "Educational technology"],
  "topology": ["Topological spaces & open sets", "Basis & subspace topology", "Continuity & homeomorphism", "Connectedness", "Compactness", "Separation axioms", "Metric spaces & completeness", "Product & quotient topology"],
  "real analysis": ["Real number system & completeness", "Sequences & convergence", "Series & convergence tests", "Limits & continuity", "Differentiation & MVT", "Riemann integration", "Sequences of functions & uniform convergence", "Metric spaces"],
  "abstract algebra": ["Groups & subgroups", "Cyclic groups & permutations", "Cosets & Lagrange's theorem", "Normal subgroups & quotient groups", "Homomorphisms & isomorphism theorems", "Rings & ideals", "Integral domains & fields", "Polynomial rings & field extensions"],
  "linear algebra": ["Vector spaces & subspaces", "Basis & dimension", "Linear transformations", "Matrix representation & rank", "Determinants", "Eigenvalues & eigenvectors", "Diagonalisation", "Inner product spaces & orthogonality"],
  "differential equations": ["First order ODEs", "Exact & linear equations", "Second order linear ODEs", "Method of undetermined coefficients", "Variation of parameters", "Series solutions", "Laplace transform methods", "Systems of ODEs", "Introduction to PDEs"],
  "microbiology": ["History & scope of microbiology", "Bacterial structure & growth", "Sterilisation & disinfection", "Microbial genetics", "Immunology basics", "Pathogenic bacteria", "Viruses & viral diseases", "Fungi & parasites", "Applied microbiology"],
  "genetics": ["Mendelian inheritance", "Extensions of Mendelism", "Linkage & crossing over", "Chromosomal aberrations", "DNA structure & replication", "Gene expression & regulation", "Mutation & DNA repair", "Population genetics", "Genetic engineering basics"],
  "cell biology": ["Cell theory & microscopy", "Plasma membrane & transport", "Cytoskeleton", "Endomembrane system", "Mitochondria & chloroplast", "Nucleus & chromatin", "Cell cycle & checkpoints", "Cell signalling", "Apoptosis & cancer biology"],
  "python": ["Syntax, variables & data types", "Control flow & loops", "Functions & scope", "Lists, tuples, dicts & sets", "File handling", "OOP in Python", "NumPy fundamentals", "Pandas & data wrangling", "Error handling & modules"],
  "data visualisation": ["Principles of visual encoding", "Choosing the right chart", "Matplotlib fundamentals", "Seaborn statistical plots", "Dashboards & storytelling", "Colour, accessibility & ethics"],
  "big data": ["Big data characteristics", "Distributed file systems (HDFS)", "MapReduce paradigm", "Apache Spark fundamentals", "NoSQL databases", "Stream processing", "Data pipelines & orchestration"],
  "cloud": ["Cloud service & deployment models", "Compute services & autoscaling", "Storage classes & databases", "VPC & networking", "IAM & security best practice", "Infrastructure as code", "Monitoring, logging & cost control", "Well-architected design"],
  "security": ["CIA triad & threat models", "Access control models", "Cryptography fundamentals", "Public key infrastructure", "Network attacks & defences", "Web application vulnerabilities (OWASP)", "Incident response", "Security governance & compliance"],
  "ethical hacking": ["Reconnaissance & footprinting", "Scanning & enumeration", "Vulnerability analysis", "System hacking & privilege escalation", "Web application attacks", "Wireless & mobile attacks", "Social engineering", "Reporting & remediation"],
  "risk management": ["Risk taxonomy & governance", "Market risk measurement", "Credit risk fundamentals", "Operational risk", "Value at Risk models", "Stress testing", "Basel framework", "Risk-adjusted performance"],
  "listening": ["Section-wise question types", "Note completion strategy", "Map & diagram labelling", "Multiple choice traps", "Accent familiarisation drills", "Timed full-section practice"],
  "reading": ["Skimming & scanning technique", "True/False/Not Given strategy", "Matching headings", "Summary completion", "Inference questions", "Timed full-section practice"],
  "writing task": ["Task 1: describing graphs", "Task 1: process & map", "Task 2: essay structure", "Opinion & discussion essays", "Cohesion & linking devices", "Lexical resource building", "Timed writing practice & self-marking"],
  "speaking": ["Part 1: personal questions", "Part 2: cue card strategy", "Part 3: abstract discussion", "Fluency & hesitation control", "Pronunciation & intonation", "Mock speaking sessions"],
  "csat": ["Comprehension passages", "Basic numeracy", "Data interpretation", "Logical reasoning & analytical ability", "Decision making & problem solving", "Time management drills"],
  "teaching & research aptitude": ["Teaching aptitude", "Research aptitude", "Comprehension", "Communication", "Logical reasoning", "Data interpretation", "ICT in education", "People, development & environment", "Higher education system"],
  "surveying": ["Principles & classification", "Chain & compass surveying", "Levelling", "Contouring", "Theodolite surveying", "Tacheometry", "Curves", "Total station & GPS"],
  "building materials": ["Stones, bricks & tiles", "Cement & mortar", "Concrete constituents", "Timber & wood products", "Steel & metals", "Paints & finishes", "Masonry construction", "Foundations & flooring"],
  "estimating": ["Types of estimates", "Units of measurement", "Detailed estimate of a building", "Rate analysis", "Specifications", "Valuation basics", "Tender & contract documents"],
  "social work": ["History & philosophy of social work", "Casework method", "Group work method", "Community organisation", "Social action & advocacy", "Fieldwork documentation", "Ethics in practice"],
  "developmental psychology": ["Theories of development", "Prenatal & infancy", "Early childhood", "Middle childhood", "Adolescence", "Adulthood & ageing", "Moral & social development"],
  "cognitive psychology": ["Attention & perception", "Memory models", "Working memory", "Knowledge representation", "Language & thought", "Problem solving & reasoning", "Decision making biases"],
  "abnormal psychology": ["Defining abnormality & classification", "Anxiety disorders", "Mood disorders", "Schizophrenia spectrum", "Personality disorders", "Trauma & stress disorders", "Therapies & interventions"],
};
