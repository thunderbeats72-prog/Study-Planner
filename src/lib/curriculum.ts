export type SeedSubject = {
  name: string;
  units: number;
  difficulty: "Easy" | "Medium" | "Hard";
  color: string;
};

export type Course = {
  id: string;
  name: string;
  level: string;
  subjects: SeedSubject[];
};

export const LEVELS = [
  { id: "nursery", label: "Nursery / Pre-School", sub: "Ages 3-6, foundational play learning" },
  { id: "school", label: "School", sub: "Class 1-12 (CBSE / ICSE / State)" },
  { id: "diploma", label: "Diploma", sub: "Polytechnic / ITI / Vocational" },
  { id: "ug", label: "Undergraduate", sub: "BA / BSc / BCom / BTech / BBA" },
  { id: "pg", label: "Postgraduate", sub: "MA / MSc / MBA / MTech" },
  { id: "phd", label: "Doctoral / Research", sub: "PhD / MPhil / Post-Doc" },
  { id: "competitive", label: "Competitive Exam", sub: "JEE / NEET / UPSC / GATE / CAT" },
  { id: "professional", label: "Professional", sub: "CA / CFA / CPA / ACCA / PMP" },
];

const P = "#8b5cf6";
const B = "#3b82f6";
const G = "#10b981";
const O = "#f59e0b";
const R = "#ef4444";
const C = "#06b6d4";
const PK = "#ec4899";
const L = "#84cc16";

const s = (
  name: string,
  units: number,
  difficulty: "Easy" | "Medium" | "Hard",
  color: string
): SeedSubject => ({ name, units, difficulty, color });

export const COURSE_DB: Record<string, Course> = {
  nursery_foundation: {
    id: "nursery_foundation",
    name: "Nursery Foundation Program",
    level: "nursery",
    subjects: [
      s("Alphabet & Phonics", 5, "Easy", P),
      s("Numbers & Counting", 4, "Easy", B),
      s("Shapes, Colours & Patterns", 4, "Easy", G),
      s("Rhymes & Story Time", 3, "Easy", O),
      s("Drawing & Motor Skills", 3, "Easy", PK),
    ],
  },
  kg_readiness: {
    id: "kg_readiness",
    name: "Kindergarten Readiness (UKG)",
    level: "nursery",
    subjects: [
      s("Reading Readiness", 5, "Easy", P),
      s("Early Maths", 5, "Easy", B),
      s("Environmental Awareness", 4, "Easy", G),
      s("Handwriting Practice", 4, "Easy", O),
    ],
  },
  class_5: {
    id: "class_5",
    name: "Class 5 (Primary)",
    level: "school",
    subjects: [
      s("Mathematics", 8, "Medium", B),
      s("English", 7, "Easy", P),
      s("Environmental Science", 7, "Easy", G),
      s("Hindi", 6, "Easy", O),
      s("Computer Basics", 4, "Easy", C),
    ],
  },
  class_8: {
    id: "class_8",
    name: "Class 8 (Middle School)",
    level: "school",
    subjects: [
      s("Mathematics", 10, "Medium", B),
      s("Science", 10, "Medium", G),
      s("Social Science", 9, "Medium", O),
      s("English", 8, "Easy", P),
      s("Second Language", 6, "Easy", PK),
    ],
  },
  class_10: {
    id: "class_10",
    name: "Class 10 (Board Exam)",
    level: "school",
    subjects: [
      s("Mathematics", 14, "Hard", B),
      s("Science", 13, "Hard", G),
      s("Social Science", 12, "Medium", O),
      s("English", 10, "Medium", P),
      s("Information Technology", 6, "Easy", C),
    ],
  },
  class_12_pcm: {
    id: "class_12_pcm",
    name: "Class 12 — Science (PCM)",
    level: "school",
    subjects: [
      s("Physics", 14, "Hard", B),
      s("Chemistry", 14, "Hard", G),
      s("Mathematics", 13, "Hard", P),
      s("English Core", 8, "Easy", O),
      s("Computer Science", 8, "Medium", C),
    ],
  },
  class_12_pcb: {
    id: "class_12_pcb",
    name: "Class 12 — Science (PCB)",
    level: "school",
    subjects: [
      s("Physics", 14, "Hard", B),
      s("Chemistry", 14, "Hard", G),
      s("Biology", 13, "Hard", L),
      s("English Core", 8, "Easy", O),
    ],
  },
  class_12_commerce: {
    id: "class_12_commerce",
    name: "Class 12 — Commerce",
    level: "school",
    subjects: [
      s("Accountancy", 12, "Hard", B),
      s("Business Studies", 11, "Medium", G),
      s("Economics", 10, "Medium", O),
      s("Mathematics", 12, "Hard", P),
      s("English Core", 8, "Easy", PK),
    ],
  },
  diploma_mech: {
    id: "diploma_mech",
    name: "Diploma in Mechanical Engineering",
    level: "diploma",
    subjects: [
      s("Engineering Mechanics", 8, "Hard", B),
      s("Thermodynamics", 8, "Hard", R),
      s("Strength of Materials", 7, "Hard", O),
      s("Manufacturing Processes", 7, "Medium", G),
      s("Engineering Drawing", 6, "Medium", P),
    ],
  },
  diploma_cs: {
    id: "diploma_cs",
    name: "Diploma in Computer Engineering",
    level: "diploma",
    subjects: [
      s("Programming in C", 8, "Medium", B),
      s("Data Structures", 8, "Hard", P),
      s("Database Management", 7, "Medium", G),
      s("Computer Networks", 7, "Medium", C),
      s("Web Development", 6, "Easy", O),
    ],
  },
  btech_cse: {
    id: "btech_cse",
    name: "B.Tech Computer Science",
    level: "ug",
    subjects: [
      s("Data Structures & Algorithms", 12, "Hard", P),
      s("Operating Systems", 9, "Hard", B),
      s("Database Management Systems", 9, "Medium", G),
      s("Computer Networks", 8, "Medium", C),
      s("Theory of Computation", 7, "Hard", R),
      s("Discrete Mathematics", 8, "Hard", O),
    ],
  },
  bsc_physics: {
    id: "bsc_physics",
    name: "B.Sc Physics",
    level: "ug",
    subjects: [
      s("Classical Mechanics", 9, "Hard", B),
      s("Electromagnetism", 9, "Hard", O),
      s("Quantum Mechanics", 8, "Hard", P),
      s("Thermodynamics & Stat Mech", 8, "Hard", R),
      s("Mathematical Physics", 8, "Hard", G),
    ],
  },
  bcom: {
    id: "bcom",
    name: "B.Com (Honours)",
    level: "ug",
    subjects: [
      s("Financial Accounting", 10, "Medium", B),
      s("Business Law", 8, "Medium", O),
      s("Corporate Accounting", 9, "Hard", G),
      s("Cost Accounting", 9, "Hard", P),
      s("Business Economics", 8, "Medium", C),
    ],
  },
  ba_english: {
    id: "ba_english",
    name: "B.A English Literature",
    level: "ug",
    subjects: [
      s("British Poetry", 8, "Medium", P),
      s("Indian Writing in English", 8, "Medium", G),
      s("Literary Criticism", 7, "Hard", O),
      s("Drama & Theatre", 7, "Medium", B),
      s("Linguistics & Phonetics", 6, "Hard", C),
    ],
  },
  bba: {
    id: "bba",
    name: "BBA — Business Administration",
    level: "ug",
    subjects: [
      s("Principles of Management", 8, "Easy", B),
      s("Marketing Management", 8, "Medium", O),
      s("Financial Management", 9, "Hard", G),
      s("Human Resource Management", 7, "Medium", P),
      s("Business Statistics", 8, "Hard", C),
    ],
  },
  mbbs: {
    id: "mbbs",
    name: "MBBS (Pre & Para Clinical)",
    level: "ug",
    subjects: [
      s("Human Anatomy", 12, "Hard", R),
      s("Physiology", 11, "Hard", B),
      s("Biochemistry", 10, "Hard", G),
      s("Pathology", 10, "Hard", P),
      s("Pharmacology", 10, "Hard", O),
    ],
  },
  mba: {
    id: "mba",
    name: "MBA — Master of Business Administration",
    level: "pg",
    subjects: [
      s("Strategic Management", 8, "Hard", B),
      s("Corporate Finance", 9, "Hard", G),
      s("Operations & Supply Chain", 8, "Medium", O),
      s("Marketing Analytics", 8, "Medium", P),
      s("Organisational Behaviour", 7, "Easy", C),
    ],
  },
  msc_cs: {
    id: "msc_cs",
    name: "M.Sc / M.Tech Computer Science",
    level: "pg",
    subjects: [
      s("Advanced Algorithms", 9, "Hard", P),
      s("Machine Learning", 10, "Hard", B),
      s("Distributed Systems", 8, "Hard", C),
      s("Compiler Design", 8, "Hard", O),
      s("Research Methodology", 6, "Medium", G),
    ],
  },
  ma_economics: {
    id: "ma_economics",
    name: "M.A Economics",
    level: "pg",
    subjects: [
      s("Microeconomic Theory", 9, "Hard", B),
      s("Macroeconomic Theory", 9, "Hard", G),
      s("Econometrics", 9, "Hard", P),
      s("Development Economics", 7, "Medium", O),
      s("International Economics", 7, "Medium", C),
    ],
  },
  phd_research: {
    id: "phd_research",
    name: "PhD Research Program",
    level: "phd",
    subjects: [
      s("Literature Review & Survey", 8, "Hard", P),
      s("Research Methodology", 7, "Hard", B),
      s("Advanced Statistics", 8, "Hard", G),
      s("Thesis Writing & Publication", 8, "Hard", O),
      s("Coursework Specialisation", 8, "Hard", C),
    ],
  },
  phd_coursework: {
    id: "phd_coursework",
    name: "PhD Coursework + Comprehensive Exam",
    level: "phd",
    subjects: [
      s("Core Domain Theory", 9, "Hard", P),
      s("Quantitative Methods", 8, "Hard", B),
      s("Qualitative Methods", 7, "Hard", G),
      s("Ethics & Scientific Writing", 6, "Medium", O),
    ],
  },
  jee: {
    id: "jee",
    name: "JEE Main + Advanced",
    level: "competitive",
    subjects: [
      s("Physics", 14, "Hard", B),
      s("Physical Chemistry", 9, "Hard", G),
      s("Organic Chemistry", 9, "Hard", L),
      s("Inorganic Chemistry", 8, "Medium", C),
      s("Mathematics", 15, "Hard", P),
    ],
  },
  neet: {
    id: "neet",
    name: "NEET UG",
    level: "competitive",
    subjects: [
      s("Botany", 11, "Medium", L),
      s("Zoology", 11, "Hard", G),
      s("Physics", 13, "Hard", B),
      s("Physical Chemistry", 8, "Hard", O),
      s("Organic Chemistry", 8, "Hard", P),
      s("Inorganic Chemistry", 7, "Medium", C),
    ],
  },
  upsc: {
    id: "upsc",
    name: "UPSC Civil Services (Prelims + Mains)",
    level: "competitive",
    subjects: [
      s("Indian Polity", 10, "Hard", B),
      s("Modern & Ancient History", 10, "Medium", O),
      s("Geography", 9, "Medium", G),
      s("Indian Economy", 9, "Hard", P),
      s("Environment & Ecology", 7, "Easy", L),
      s("Current Affairs & Essay", 8, "Medium", C),
    ],
  },
  gate_cse: {
    id: "gate_cse",
    name: "GATE — Computer Science",
    level: "competitive",
    subjects: [
      s("Algorithms & Data Structures", 10, "Hard", P),
      s("Operating Systems", 8, "Hard", B),
      s("DBMS", 7, "Medium", G),
      s("Computer Networks", 7, "Medium", C),
      s("Digital Logic & COA", 9, "Hard", O),
      s("Engineering Mathematics", 9, "Hard", R),
    ],
  },
  cat: {
    id: "cat",
    name: "CAT / MBA Entrance",
    level: "competitive",
    subjects: [
      s("Quantitative Aptitude", 12, "Hard", B),
      s("Verbal Ability & RC", 9, "Medium", P),
      s("Data Interpretation & LR", 10, "Hard", G),
      s("Mock Test Analysis", 6, "Medium", O),
    ],
  },
  ssc_cgl: {
    id: "ssc_cgl",
    name: "SSC CGL / Banking",
    level: "competitive",
    subjects: [
      s("Quantitative Aptitude", 11, "Medium", B),
      s("Reasoning Ability", 10, "Medium", P),
      s("English Language", 9, "Medium", O),
      s("General Awareness", 9, "Easy", G),
    ],
  },
  ca_inter: {
    id: "ca_inter",
    name: "CA Intermediate",
    level: "professional",
    subjects: [
      s("Advanced Accounting", 11, "Hard", B),
      s("Corporate & Other Laws", 10, "Hard", O),
      s("Taxation", 11, "Hard", G),
      s("Cost & Management Accounting", 10, "Hard", P),
      s("Auditing & Assurance", 9, "Medium", C),
    ],
  },
  cfa_l1: {
    id: "cfa_l1",
    name: "CFA Level 1",
    level: "professional",
    subjects: [
      s("Ethical & Professional Standards", 6, "Medium", B),
      s("Quantitative Methods", 8, "Hard", P),
      s("Financial Statement Analysis", 10, "Hard", G),
      s("Corporate Issuers", 7, "Medium", O),
      s("Equity & Fixed Income", 10, "Hard", C),
    ],
  },
  pmp: {
    id: "pmp",
    name: "PMP Certification",
    level: "professional",
    subjects: [
      s("People Domain", 8, "Medium", B),
      s("Process Domain", 10, "Hard", G),
      s("Business Environment", 6, "Medium", O),
      s("Agile & Hybrid Practices", 7, "Medium", P),
    ],
  },
};

import { EXTRA_COURSES, EXTRA_TOPICS } from "./courses2";

for (const c of EXTRA_COURSES) COURSE_DB[c.id] = c;

export const LEVEL_COURSES: Record<string, string[]> = {
  nursery: ["nursery_foundation", "kg_readiness"],
  school: ["class_5", "class_8", "class_10", "class_12_pcm", "class_12_pcb", "class_12_commerce"],
  diploma: ["diploma_mech", "diploma_cs"],
  ug: ["btech_cse", "bsc_physics", "bcom", "ba_english", "bba", "mbbs"],
  pg: ["mba", "msc_cs", "ma_economics"],
  phd: ["phd_research", "phd_coursework"],
  competitive: ["jee", "neet", "upsc", "gate_cse", "cat", "ssc_cgl"],
  professional: ["ca_inter", "cfa_l1", "pmp"],
};

for (const c of EXTRA_COURSES) {
  if (!LEVEL_COURSES[c.level]) LEVEL_COURSES[c.level] = [];
  if (!LEVEL_COURSES[c.level].includes(c.id)) LEVEL_COURSES[c.level].push(c.id);
}
for (const key of Object.keys(LEVEL_COURSES)) {
  LEVEL_COURSES[key].sort((a, b) =>
    (COURSE_DB[a]?.name || "").localeCompare(COURSE_DB[b]?.name || "")
  );
}

/* ============================================================
   TOPIC BANK — lesson-level breakdown for common subjects.
============================================================ */
export const TOPIC_BANK: Record<string, string[]> = {
  "alphabet": ["Letters A–E: sounds & tracing", "Letters F–J: sounds & tracing", "Letters K–O: sounds & tracing", "Letters P–T: sounds & tracing", "Letters U–Z: sounds & tracing", "Blending CVC words", "Rhyming sound families", "Picture-to-letter matching"],
  "numbers & counting": ["Counting 1–10 with objects", "Writing numerals 1–10", "Counting 11–20", "Number ordering & comparison", "Simple addition with fingers", "Simple subtraction stories", "Shapes of numbers puzzle"],
  "shapes": ["Circle & oval hunt", "Square & rectangle", "Triangle & star", "Primary colours", "Secondary colours mixing", "Repeating patterns AB", "Sorting by size"],
  "rhymes": ["Action rhymes", "Animal rhymes", "Story listening & recall", "Picture story narration", "Role play & expression"],
  "drawing": ["Straight & curved strokes", "Colouring inside lines", "Clay & finger art", "Paper folding", "Scissor safety cutting"],
  "reading readiness": ["Sight words set 1", "Sight words set 2", "Two-letter blends", "Three-letter words", "Simple sentence reading", "Comprehension picture Q&A"],
  "early maths": ["Number sense to 50", "Before/after/between", "Skip counting by 2s", "Addition to 20", "Subtraction to 20", "Measurement: big/small", "Time: day & night"],
  "handwriting": ["Capital letters practice", "Small letters practice", "Word spacing", "Numbers 1–50 writing", "Copy writing sentences"],
  "environmental": ["My body & senses", "My family & home", "Plants around us", "Animals & their homes", "Food & nutrition", "Water and its uses", "Safety rules"],

  "mathematics": ["Number systems & operations", "Algebraic expressions", "Linear equations", "Quadratic equations", "Polynomials & factorisation", "Coordinate geometry", "Triangles & congruence", "Circles & tangents", "Trigonometry basics", "Heights & distances", "Mensuration: area & volume", "Statistics: mean, median, mode", "Probability fundamentals", "Sequences & series", "Sets, relations & functions"],
  "physics": ["Units, dimensions & measurement", "Kinematics in 1D & 2D", "Newton's laws of motion", "Work, energy & power", "Rotational motion & torque", "Gravitation", "Properties of matter & fluids", "Thermodynamics & kinetic theory", "Oscillations & SHM", "Waves & sound", "Electrostatics", "Current electricity", "Magnetism & EMI", "Alternating current", "Ray & wave optics", "Modern physics: photoelectric, atoms, nuclei", "Semiconductor electronics"],
  "chemistry": ["Atomic structure", "Periodic table & periodicity", "Chemical bonding", "States of matter", "Thermochemistry", "Chemical & ionic equilibrium", "Redox reactions", "Electrochemistry", "Chemical kinetics", "Solutions & colligative properties", "Surface chemistry", "Coordination compounds", "Hydrocarbons", "Haloalkanes & haloarenes", "Alcohols, phenols & ethers", "Aldehydes, ketones & acids", "Amines & biomolecules", "Polymers & chemistry in everyday life"],
  "physical chemistry": ["Mole concept & stoichiometry", "Atomic structure", "Gaseous state", "Thermodynamics", "Chemical equilibrium", "Ionic equilibrium", "Electrochemistry", "Chemical kinetics", "Solid state & solutions"],
  "organic chemistry": ["IUPAC nomenclature", "General organic chemistry (GOC)", "Isomerism & stereochemistry", "Hydrocarbons & reaction mechanisms", "Halogen derivatives", "Alcohols, phenols, ethers", "Carbonyl compounds", "Carboxylic acids & derivatives", "Nitrogen compounds & biomolecules", "Named reactions revision"],
  "inorganic chemistry": ["Periodic properties", "Chemical bonding & VSEPR", "s-Block elements", "p-Block group 13–14", "p-Block group 15–18", "d & f Block elements", "Coordination compounds", "Metallurgy", "Qualitative salt analysis"],
  "biology": ["Cell: structure & function", "Biomolecules", "Cell cycle & division", "Plant physiology: photosynthesis", "Plant physiology: respiration & transport", "Human digestion & respiration", "Circulation & excretion", "Neural & chemical coordination", "Reproduction in plants", "Human reproduction & health", "Genetics & inheritance", "Molecular basis of inheritance", "Evolution", "Biotechnology principles & applications", "Ecology & ecosystems"],
  "botany": ["Plant kingdom classification", "Morphology of flowering plants", "Anatomy of flowering plants", "Cell structure", "Photosynthesis", "Respiration in plants", "Plant growth & development", "Sexual reproduction in plants", "Genetics basics", "Ecology & environment", "Biotechnology in plants"],
  "zoology": ["Animal kingdom classification", "Structural organisation in animals", "Digestion & absorption", "Breathing & exchange of gases", "Body fluids & circulation", "Excretory products", "Locomotion & movement", "Neural control", "Chemical coordination", "Human reproduction", "Human health & disease"],
  "science": ["Matter in our surroundings", "Atoms & molecules", "Structure of the atom", "Chemical reactions & equations", "Acids, bases & salts", "Metals & non-metals", "Carbon & its compounds", "Life processes", "Control & coordination", "Heredity & evolution", "Light: reflection & refraction", "Electricity & magnetic effects", "Sources of energy & environment"],
  "social science": ["Rise of nationalism in Europe", "Nationalism in India", "The making of a global world", "Resources & development", "Water & agriculture", "Minerals & energy resources", "Power sharing & federalism", "Democracy & diversity", "Political parties & outcomes", "Development economics", "Sectors of the Indian economy", "Money, credit & globalisation"],
  "english": ["Reading comprehension strategies", "Grammar: tenses & verbs", "Grammar: modals & voice", "Sentence transformation", "Vocabulary & word power", "Formal letter writing", "Article & report writing", "Poetry appreciation", "Prose analysis", "Speaking & listening practice"],
  "hindi": ["गद्य खंड — पाठ अध्ययन", "पद्य खंड — कविता विश्लेषण", "व्याकरण — संधि व समास", "व्याकरण — अलंकार व रस", "अपठित गद्यांश", "पत्र लेखन", "निबंध लेखन"],
  "computer": ["Computer fundamentals", "Operating system basics", "Word processing", "Spreadsheets & formulas", "Presentations", "Internet & safety", "Introduction to coding"],

  "data structures": ["Complexity analysis & Big-O", "Arrays & strings", "Linked lists", "Stacks & queues", "Recursion & backtracking", "Trees & BST", "Heaps & priority queues", "Hashing", "Graphs: BFS/DFS", "Shortest paths & MST", "Sorting algorithms", "Searching & binary search patterns", "Greedy algorithms", "Dynamic programming", "Tries & advanced structures"],
  "algorithms": ["Asymptotic analysis", "Divide & conquer", "Greedy technique", "Dynamic programming", "Graph algorithms", "Network flow", "String algorithms", "NP-completeness", "Approximation & randomised algorithms"],
  "operating system": ["OS structure & system calls", "Processes & threads", "CPU scheduling", "Synchronisation & semaphores", "Deadlocks", "Memory management", "Virtual memory & paging", "File systems", "Disk scheduling & I/O"],
  "database": ["ER modelling", "Relational model & algebra", "SQL fundamentals", "Advanced SQL & joins", "Normalisation 1NF–BCNF", "Transactions & ACID", "Concurrency control", "Indexing & B+ trees", "Query optimisation"],
  "computer networks": ["Network models: OSI & TCP/IP", "Physical & data link layer", "Error detection & MAC", "Ethernet & switching", "Network layer & IP addressing", "Routing algorithms", "Transport layer: TCP/UDP", "Congestion control", "Application layer protocols", "Network security basics"],
  "theory of computation": ["Finite automata DFA/NFA", "Regular expressions & languages", "Pumping lemma for regular languages", "Context free grammars", "Pushdown automata", "CFL properties & pumping lemma", "Turing machines", "Decidability & undecidability", "Complexity classes P/NP"],
  "discrete math": ["Propositional logic", "Predicate logic & proofs", "Set theory & relations", "Functions & countability", "Combinatorics & counting", "Recurrence relations", "Graph theory", "Trees & spanning trees", "Group theory & lattices"],
  "machine learning": ["ML problem framing & data splits", "Linear regression", "Logistic regression & classification", "Regularisation & bias-variance", "Decision trees & ensembles", "SVM & kernels", "Unsupervised learning & clustering", "Dimensionality reduction (PCA)", "Neural networks & backpropagation", "CNNs & sequence models", "Model evaluation & deployment"],
  "digital logic": ["Number systems & codes", "Boolean algebra & K-maps", "Combinational circuits", "Multiplexers & decoders", "Sequential circuits & flip-flops", "Counters & registers", "Memory organisation", "Instruction set architecture", "Pipelining & hazards"],
  "compiler": ["Lexical analysis", "Parsing: top-down", "Parsing: bottom-up LR", "Syntax directed translation", "Intermediate code generation", "Runtime environments", "Code optimisation", "Code generation"],
  "distributed systems": ["System models & failure modes", "Time & logical clocks", "Consensus & Paxos/Raft", "Replication & consistency", "Distributed transactions", "Fault tolerance", "MapReduce & big data", "Case studies"],
  "programming in c": ["Data types & operators", "Control statements", "Loops & iterations", "Functions & scope", "Arrays & strings", "Pointers", "Structures & unions", "File handling", "Dynamic memory"],
  "web development": ["HTML structure & semantics", "CSS layout & flexbox", "Responsive design", "JavaScript fundamentals", "DOM manipulation", "Fetch & APIs", "Frameworks intro", "Deployment basics"],

  "accounting": ["Accounting principles & concepts", "Journal, ledger & trial balance", "Depreciation accounting", "Bank reconciliation", "Final accounts of sole trader", "Partnership: fundamentals", "Partnership: admission & retirement", "Company accounts: share capital", "Debentures & redemption", "Cash flow statement", "Financial statement analysis", "Ratio analysis"],
  "cost accounting": ["Cost concepts & classification", "Material cost control", "Labour cost & overheads", "Job & batch costing", "Process costing", "Contract costing", "Marginal costing & CVP", "Standard costing & variances", "Budgetary control"],
  "taxation": ["Basic concepts & residential status", "Income from salaries", "Income from house property", "Profits & gains of business", "Capital gains", "Income from other sources", "Deductions & set-off", "GST: concepts & supply", "GST: input tax credit & returns"],
  "economics": ["Introduction to economics", "Demand & elasticity", "Consumer behaviour & utility", "Production & cost", "Market structures", "National income accounting", "Money & banking", "Inflation & unemployment", "Fiscal & monetary policy", "International trade & BOP", "Indian economy: growth & reforms"],
  "microeconomic": ["Consumer theory & preferences", "Utility maximisation", "Producer theory", "Cost functions", "Perfect competition", "Monopoly & price discrimination", "Oligopoly & game theory", "General equilibrium", "Welfare & market failure"],
  "macroeconomic": ["National income & measurement", "Classical vs Keynesian models", "IS-LM framework", "AD-AS analysis", "Consumption & investment theories", "Money demand & supply", "Inflation & Phillips curve", "Open economy macro", "Growth models"],
  "econometrics": ["Statistical foundations", "Simple linear regression", "Multiple regression & inference", "Heteroskedasticity", "Autocorrelation", "Multicollinearity & specification", "Panel data models", "Time series & stationarity", "Instrumental variables"],
  "business studies": ["Nature & purpose of business", "Principles of management", "Business environment", "Planning & organising", "Staffing & directing", "Controlling", "Financial management", "Financial markets", "Marketing management", "Consumer protection"],
  "management": ["Evolution of management thought", "Planning & decision making", "Organising & structure", "Leadership theories", "Motivation theories", "Controlling & performance", "Change management", "Ethics & CSR"],
  "marketing": ["Marketing concepts & orientation", "Market segmentation & targeting", "Positioning & branding", "Product & new product development", "Pricing strategies", "Distribution channels", "Integrated marketing communication", "Digital & analytics", "Consumer behaviour"],
  "finance": ["Time value of money", "Risk & return", "Valuation of bonds", "Valuation of equity", "Cost of capital", "Capital budgeting", "Capital structure theories", "Dividend policy", "Working capital management"],
  "human resource": ["HR planning", "Recruitment & selection", "Training & development", "Performance appraisal", "Compensation management", "Industrial relations", "HR analytics"],
  "statistics": ["Data types & descriptive statistics", "Probability fundamentals", "Random variables & distributions", "Normal distribution", "Sampling & CLT", "Estimation & confidence intervals", "Hypothesis testing", "Chi-square & ANOVA", "Correlation & regression", "Non-parametric tests"],
  "quantitative aptitude": ["Number system & divisibility", "Percentages", "Profit, loss & discount", "Ratio, proportion & mixtures", "Averages & alligation", "Time, speed & distance", "Time & work", "Simple & compound interest", "Algebra & equations", "Geometry & mensuration", "Permutation, combination & probability", "Data sufficiency"],
  "reasoning": ["Series & analogy", "Coding-decoding", "Blood relations", "Direction sense", "Syllogism", "Seating arrangement", "Puzzles & scheduling", "Input-output", "Statement & assumptions", "Non-verbal reasoning"],
  "verbal ability": ["Reading comprehension technique", "Para jumbles", "Para summary", "Odd sentence out", "Critical reasoning", "Vocabulary in context", "Grammar & error spotting"],
  "data interpretation": ["Tables & caselets", "Bar & line graphs", "Pie charts", "Mixed DI sets", "Logical reasoning sets", "Arrangements & grids", "Games & tournaments", "Venn diagram sets"],
  "general awareness": ["Static GK: India", "History highlights", "Geography highlights", "Polity essentials", "Economy & schemes", "Science & tech current", "Sports & awards", "Monthly current affairs"],
  "polity": ["Historical background & making of Constitution", "Preamble & basic structure", "Fundamental rights", "DPSP & fundamental duties", "Union executive", "Parliament & legislative process", "Judiciary & judicial review", "Federalism & centre-state relations", "Constitutional bodies", "Local governance & panchayati raj"],
  "history": ["Indus valley & Vedic age", "Mahajanapadas to Mauryas", "Gupta & post-Gupta era", "Delhi Sultanate", "Mughal empire", "Advent of Europeans", "1857 revolt & aftermath", "Moderates & extremists", "Gandhian era movements", "Independence & partition"],
  "geography": ["Geomorphology", "Climatology", "Oceanography", "Indian physiography", "Indian climate & monsoon", "Drainage systems", "Soils & agriculture", "Mineral & industrial geography", "Population & settlement", "Map-based practice"],
  "environment": ["Ecosystem & energy flow", "Biodiversity & hotspots", "Conservation efforts & acts", "Climate change & IPCC", "Pollution & control", "Sustainable development goals", "Environmental institutions"],
  "current affairs": ["Weekly news digest", "Government schemes tracker", "International relations", "Economy & budget updates", "Science & tech updates", "Essay structuring practice", "Answer writing practice"],
  "law": ["Indian Contract Act — essentials", "Special contracts", "Sale of Goods Act", "Partnership & LLP", "Companies Act: incorporation", "Companies Act: management", "Negotiable Instruments Act", "Interpretation of statutes"],
  "auditing": ["Nature & scope of audit", "Audit planning & documentation", "Risk assessment & internal control", "Audit evidence & sampling", "Audit of items in financial statements", "Company audit", "Audit report", "Special audits"],
  "ethical": ["Code of ethics & standards", "Professional conduct programme", "GIPS overview", "Ethics case applications"],
  "anatomy": ["General anatomy & terminology", "Upper limb", "Lower limb", "Thorax", "Abdomen", "Head & neck", "Neuroanatomy", "Histology basics", "Embryology basics"],
  "physiology": ["Cell physiology & transport", "Nerve & muscle physiology", "Blood & body fluids", "Cardiovascular physiology", "Respiratory physiology", "Renal physiology", "Gastrointestinal physiology", "Endocrine physiology", "Neurophysiology & special senses"],
  "biochemistry": ["Carbohydrate chemistry & metabolism", "Lipid chemistry & metabolism", "Protein & amino acid metabolism", "Enzymes & kinetics", "Vitamins & minerals", "Nucleic acid metabolism", "Molecular biology techniques", "Clinical biochemistry"],
  "pathology": ["Cell injury & adaptation", "Inflammation & repair", "Haemodynamics", "Neoplasia", "Immunopathology", "Haematology", "Systemic pathology: CVS & respiratory", "Systemic pathology: GIT & renal"],
  "pharmacology": ["General pharmacology & kinetics", "Autonomic nervous system drugs", "CNS pharmacology", "Cardiovascular drugs", "Chemotherapy & antibiotics", "Endocrine pharmacology", "Autacoids & NSAIDs", "Toxicology"],
  "mechanics": ["Vectors & statics", "Equilibrium of rigid bodies", "Friction", "Centroid & moment of inertia", "Kinematics of particles", "Kinetics & Newton's laws", "Work-energy methods", "Impulse & momentum", "Lagrangian formulation"],
  "thermodynamics": ["Basic concepts & zeroth law", "First law for closed systems", "First law for open systems", "Second law & entropy", "Availability & irreversibility", "Pure substances & steam", "Power cycles", "Refrigeration cycles", "Psychrometry"],
  "strength of materials": ["Simple stress & strain", "Elastic constants", "Shear force & bending moment", "Bending stresses", "Shear stresses in beams", "Torsion of shafts", "Deflection of beams", "Columns & struts", "Thin & thick cylinders"],
  "manufacturing": ["Casting processes", "Metal forming", "Welding & joining", "Machining fundamentals", "CNC & automation", "Metrology & measurement", "Quality control"],
  "engineering drawing": ["Drawing standards & lettering", "Orthographic projections", "Isometric projections", "Sectional views", "Development of surfaces", "Machine part drawing", "CAD basics"],
  "electromagnetism": ["Electrostatic field & Gauss law", "Electric potential & capacitance", "Dielectrics", "Magnetostatics & Biot-Savart", "Ampere's law & magnetic materials", "Electromagnetic induction", "Maxwell's equations", "EM waves & propagation", "Waveguides & radiation"],
  "quantum": ["Wave-particle duality", "Schrodinger equation", "Particle in a box", "Harmonic oscillator", "Hydrogen atom", "Angular momentum & spin", "Perturbation theory", "Identical particles & statistics"],
  "mathematical physics": ["Vector calculus", "Matrices & tensors", "Complex analysis", "Fourier series & transforms", "Differential equations", "Special functions", "Probability & statistics for physics"],
  "literature": ["Historical & cultural context", "Close reading of key texts", "Themes & motifs", "Character & narrative technique", "Critical perspectives", "Comparative analysis", "Essay writing & citation"],
  "poetry": ["Prosody & metre", "Metaphysical poets", "Romantic poets", "Victorian poetry", "Modernist poetry", "Close reading practice", "Critical essay writing"],
  "criticism": ["Classical criticism: Plato & Aristotle", "Neoclassical criticism", "Romantic criticism", "New criticism & formalism", "Structuralism & post-structuralism", "Marxist & feminist criticism", "Postcolonial theory"],
  "linguistics": ["Phonetics & IPA", "Phonology", "Morphology", "Syntax", "Semantics & pragmatics", "Sociolinguistics", "Historical linguistics"],
  "research methodology": ["Research problem & questions", "Literature review technique", "Research design types", "Sampling methods", "Data collection instruments", "Qualitative analysis", "Quantitative analysis", "Research ethics", "Report & thesis structure"],
  "literature review": ["Defining scope & questions", "Database & search strategy", "Screening & inclusion criteria", "Critical appraisal of papers", "Thematic synthesis", "Identifying research gaps", "Reference management", "Writing the review chapter"],
  "thesis": ["Thesis structure & planning", "Chapter drafting workflow", "Data presentation & figures", "Discussion & argumentation", "Journal selection", "Manuscript writing", "Peer review response", "Viva preparation"],
  "strategic": ["Strategy fundamentals", "External environment analysis", "Internal capability analysis", "Business level strategy", "Corporate level strategy", "M&A and alliances", "Global strategy", "Strategy execution & BSC"],
  "operations": ["Operations strategy", "Process analysis & capacity", "Forecasting", "Inventory management", "MRP & scheduling", "Quality management & six sigma", "Lean & JIT", "Supply chain design", "Logistics & distribution"],
  "organisational behaviour": ["Individual behaviour & personality", "Perception & attribution", "Motivation at work", "Group dynamics & teams", "Leadership", "Power & politics", "Conflict & negotiation", "Organisational culture & change"],
  "people domain": ["Team building & ground rules", "Conflict management", "Leading a team", "Supporting performance", "Removing blockers", "Negotiating agreements", "Mentoring & emotional intelligence"],
  "process domain": ["Integration management", "Scope management", "Schedule management", "Cost management", "Quality management", "Resource management", "Communications", "Risk management", "Procurement", "Stakeholder engagement"],
  "agile": ["Agile mindset & manifesto", "Scrum framework", "Kanban & flow", "Hybrid approaches", "Backlog & estimation", "Iteration planning & reviews", "Agile metrics"],
  "financial statement": ["Financial reporting framework", "Income statement analysis", "Balance sheet analysis", "Cash flow statement analysis", "Inventories", "Long-lived assets", "Income taxes", "Non-current liabilities", "Financial analysis techniques"],
  "equity": ["Market organisation & structure", "Security market indexes", "Market efficiency", "Equity valuation basics", "Industry & company analysis", "Fixed income basics", "Bond valuation & yields", "Term structure & risk", "Credit analysis"],
  "mock test": ["Full-length mock #1 + analysis", "Sectional test: strengths", "Sectional test: weak areas", "Error log review", "Speed & accuracy drills", "Full-length mock #2 + analysis"],
};

const KIND_SUFFIX: Record<string, string> = {
  learn: "",
  revise: " — Revision",
  practice: " — Practice Set",
};

export function normalise(str: string): string {
  return str.toLowerCase().replace(/[^a-z\s&]/g, " ").replace(/\s+/g, " ").trim();
}

/** Find the best topic bank entry for a subject name. */
export function lookupTopicBank(subjectName: string): string[] | null {
  const n = normalise(subjectName);
  let best: { key: string; score: number } | null = null;
  for (const key of Object.keys(TOPIC_BANK)) {
    if (n.includes(key)) {
      const score = key.length;
      if (!best || score > best.score) best = { key, score };
    }
  }
  if (best) return TOPIC_BANK[best.key];
  // token overlap fallback
  const tokens = n.split(" ").filter((t) => t.length > 3);
  for (const key of Object.keys(TOPIC_BANK)) {
    const kt = key.split(" ");
    if (tokens.some((t) => kt.some((k) => k.startsWith(t) || t.startsWith(k)))) {
      return TOPIC_BANK[key];
    }
  }
  return null;
}

const GENERIC_TEMPLATES = [
  "Foundations & key terminology of {S}",
  "Core principles of {S}",
  "Classification & frameworks in {S}",
  "Analytical methods in {S}",
  "Problem solving techniques — {S}",
  "Applications & case studies in {S}",
  "Common mistakes & exam traps in {S}",
  "Advanced concepts in {S}",
  "Integration with related subjects — {S}",
  "Full syllabus consolidation — {S}",
  "Rapid recall sheet — {S}",
  "Previous-year question drill — {S}",
];

/** Deterministic curriculum synthesis: subject -> ordered lesson list. */
export function generateTopics(
  subjectName: string,
  unitCount: number,
  difficulty: string,
  level: string
): GeneratedTopic[] {
  const bank = lookupTopicBank(subjectName);
  const titles: string[] = [];
  if (bank) {
    const extend = [
      `Applied case study — ${subjectName}`,
      `Problem set & numericals — ${subjectName}`,
      `Previous-year questions — ${subjectName}`,
      `Rapid revision & recall — ${subjectName}`,
      `Integration & mock test — ${subjectName}`,
    ];
    for (let i = 0; i < unitCount; i++) {
      if (i < bank.length) titles.push(bank[i]);
      else titles.push(extend[(i - bank.length) % extend.length]);
    }
  } else {
    for (let i = 0; i < unitCount; i++) {
      titles.push(GENERIC_TEMPLATES[i % GENERIC_TEMPLATES.length].replace("{S}", subjectName));
    }
  }
  const baseMin = level === "nursery" ? 20 : level === "school" ? 40 : level === "phd" ? 70 : 50;
  const diffMul = difficulty === "Hard" ? 1.35 : difficulty === "Easy" ? 0.8 : 1;

  return titles.map((title, i) => {
    const phase = i / Math.max(1, titles.length - 1);
    const topicDiff: "Easy" | "Medium" | "Hard" =
      difficulty === "Hard" ? (phase < 0.25 ? "Medium" : "Hard")
      : difficulty === "Easy" ? (phase > 0.8 ? "Medium" : "Easy")
      : phase > 0.66 ? "Hard" : phase < 0.3 ? "Easy" : "Medium";
    return {
      unit: `Unit ${i + 1}`,
      title,
      summary: buildSummary(title, subjectName, phase),
      objectives: buildObjectives(title, subjectName),
      difficulty: topicDiff,
      estMinutes: Math.round((baseMin * diffMul * (0.85 + phase * 0.4)) / 5) * 5,
    };
  });
}

function buildSummary(title: string, subject: string, phase: number): string {
  const stage = phase < 0.33 ? "foundational" : phase < 0.7 ? "core" : "advanced";
  return `A ${stage} lesson in ${subject}. Build a clear mental model of "${title}", work the standard derivations/definitions, then apply them to 8–12 graded questions before moving on.`;
}

function buildObjectives(title: string, subject: string): string[] {
  return [
    `Explain the central idea of ${title} in your own words`,
    `Solve at least 8 practice questions from ${title}`,
    `Create a one-page recall sheet linking ${title} to the rest of ${subject}`,
  ];
}

export const KIND_LABEL = KIND_SUFFIX;

// === NMIMS EXACT TEXTBOOK DATA INJECTED HERE SAFELY ===
Object.assign(TOPIC_BANK, EXTRA_TOPICS, {
  "marketing management": [
    "Marketing: Creating Customer Value and Engagement", "Analyzing the Marketing Environment", "Consumer Markets and Buyer Behavior", "Business Markets and Business Buyer", "Customer Value-Driven Marketing", "Products, Services, and Brands: Building Customer Value", "Developing New Products and Managing the Product Life Cycle", "Pricing: Understanding and Capturing Customer Value", "Pricing Strategies: Additional Considerations", "Marketing Channels: Delivering Customer Value", "Communicating Customer Value: Integrated Marketing Communication Strategy", "Direct, Online, Social Media, and Mobile Marketing"
  ],
  "consumer behaviour": [
    "Consumer decision-making process", "Perception, learning and memory", "Motivation and personality",
    "Attitudes and persuasion", "Reference groups and culture", "Family and household buying behaviour",
    "Consumer research methods", "Online consumer behaviour", "Consumer behaviour case analysis"
  ],
  "brand management": [
    "Brand identity and positioning", "Brand equity models", "Brand architecture and portfolios",
    "Brand communication strategy", "Brand extension and revitalisation", "Measuring brand performance",
    "Luxury, service and digital branding", "Brand audit and case study"
  ],
  "sales & distribution management": [
    "Sales force roles and structure", "Sales forecasting and territory design", "Recruitment, training and motivation",
    "Sales compensation and evaluation", "Distribution channel strategy", "Retail and wholesale management",
    "Logistics and supply chain interface", "Channel conflict and control"
  ],
  "digital marketing": [
    "Digital marketing funnel", "Search engine optimisation", "Search ads and performance marketing",
    "Social media strategy", "Content marketing and storytelling", "Email and lifecycle marketing",
    "Web analytics and attribution", "Marketing automation and AI tools", "Campaign optimisation project"
  ],
  "marketing research": [
    "Research problem and design", "Sampling methods", "Questionnaire design", "Qualitative research methods",
    "Survey and experimental research", "Data coding and cleaning", "Hypothesis testing for marketing",
    "Conjoint, segmentation and perceptual maps", "Research report and presentation"
  ],
  "services marketing": [
    "Characteristics of services", "Service quality and SERVQUAL", "Service blueprinting",
    "Customer experience design", "Pricing and demand management in services", "People, process and physical evidence",
    "Service recovery and complaint handling", "Services marketing cases"
  ],
  "business communication": [
    "Professional Communication in a Digital, Social, Mobile World", "Writing Business Messages", "Completing Business Messages", "Digital Media", "Social Media", "Writing Routine and Positive Messages", "Writing Negative Messages", "Writing Persuasive Messages", "Writing and Completing Reports and Proposals", "Developing Presentations in a Social Media Environment", "Building Careers and Writing Resumes", "Applying and Interviewing for Employment"
  ],
  "financial accounting": [
    "Introduction to Financial Accounting", "Accounting Process & Rules", "Financial Statements", "Preparation of Financial Statements", "Financial Reporting Standards I", "Financial Reporting Standards II", "Corporate Financial Statements", "Statement of Cash Flows", "Analysis of Financial Statement I", "Analysis of Financial Statement II", "Ethics in Accounting", "Emerging Trends in Accounting"
  ],
  "micro economics & macro economics": [
    "Introduction to Microeconomics", "Demand and Supply Analysis", "Elasticity of Demand and Supply", "Consumer Demand Analysis and Demand Forecasting", "Cost and Production Theory", "Introduction to Perfect and Monopoly Market Structure - I", "The Market Structure - II and Market Failure", "Overview of Macroeconomics and Circular Flow of the Economy", "Measuring a Nation's Income", "Determination of National Income through Aggregate Demand and Aggregate Supply", "Keynesian Theory of Income Determination", "Monetary and Fiscal Policy"
  ],
  "organizational behavior": [
    "Introduction to Organizational Behavior", "Evolution and Approaches to Organizational Behavior", "Opportunities and Challenges to Organizational Behavior", "Abilities, Values and Attitude", "Personality and Emotions", "Perception", "Learning and Reinforcement", "Motivation", "Conflict Management", "Stress Management", "Power & Politics in Organizations", "Group Dynamics and Teams", "Leadership", "Organizational Culture and Change", "Organizational Development", "International Context of Organizational Behavior"
  ],
  "quantitative methods - i": [
    "Probability and Probability Concepts", "Discrete Probability Distributions, Binomial and Poisson", "Continuous Probability Distribution - Normal Distribution", "Sampling and Sampling Distribution", "Theory of Estimation", "Testing of Hypothesis", "Testing of Hypothesis - Proportion", "Testing of Hypothesis-Variance, single sample", "Testing of Hypothesis, Variance, Two samples using the F test", "Testing of Hypothesis using ANOVA (Analysis of Variance)", "Correlation and Regression - Single Independent Variable", "Regression with more than one Independent Variables"
  ],
  "cost & management accounting": ["Cost concepts and classification", "Material and labour cost", "Overhead allocation", "Marginal costing", "Budgetary control", "Standard costing", "Variance analysis", "Decision making with costs"],
  "legal aspect of business": ["Indian Contract Act", "Sale of Goods Act", "Companies Act basics", "Consumer Protection Act", "Competition law", "Intellectual property basics", "Cyber law and data privacy"],
  "business analytics": ["Analytics lifecycle", "Data cleaning and preparation", "Descriptive analytics", "Dashboard and visualisation", "Regression for business", "Forecasting basics", "Customer analytics", "Decision analytics project"],
  "corporate finance": ["Time value of money", "Risk and return", "Capital budgeting", "Cost of capital", "Capital structure", "Dividend decisions", "Working capital management", "Corporate finance case analysis"],
  "integrated marketing communications": ["IMC planning process", "Advertising strategy", "Media planning", "Sales promotion", "Public relations", "Direct and database marketing", "Digital and social communication", "Campaign evaluation"],
  "sales management": ["Sales organisation and roles", "Sales forecasting", "Territory and quota design", "Recruitment and training", "Motivation and compensation", "Sales performance evaluation", "Key account management", "CRM in sales"],
  "international marketing": ["Global marketing environment", "Market selection and entry modes", "Product adaptation vs standardisation", "International pricing", "Global distribution channels", "International promotion", "Export documentation", "Global marketing strategy cases"],
  "indian ethos": ["Indian ethos in management", "Values and ethics", "Corporate governance", "Ethical dilemmas", "Spirituality and leadership", "CSR and responsible business"],
  "corporate sustainability": ["Sustainability concepts", "ESG frameworks", "Climate risk for business", "Sustainable supply chains", "Sustainability reporting", "Circular economy", "Stakeholder capitalism"],
  "project part i": ["Problem identification", "Research objectives", "Literature scan", "Research design", "Data collection plan", "Proposal writing"],
  "project part ii": ["Data analysis", "Findings and interpretation", "Recommendations", "Report writing", "Presentation and viva preparation"],
});

/* ============================================================
   FREE-TEXT COURSE → SUBJECT SYNTHESIS
============================================================ */

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6"];

const sub = (
  name: string,
  units = 8,
  difficulty: "Easy" | "Medium" | "Hard" = "Medium"
): SeedSubject => ({ name, units, difficulty, color: "#6366f1" });

type Rule = { match: RegExp; subjects: SeedSubject[] };

const RULES: Rule[] = [
  { match: /nursery|playgroup|pre-?school|toddler|lkg|ukg|kinder/i, subjects: [
    sub("Alphabet & Phonics", 5, "Easy"), sub("Numbers & Counting", 4, "Easy"),
    sub("Shapes, Colours & Patterns", 4, "Easy"), sub("Rhymes & Story Time", 3, "Easy"),
    sub("Drawing & Motor Skills", 3, "Easy")] },
  { match: /nursing|gnm|anm/i, subjects: [
    sub("Anatomy", 9, "Hard"), sub("Physiology", 9, "Hard"),
    sub("Nursing Foundations", 9), sub("Microbiology", 6), sub("Nutrition & Biochemistry", 7)] },
  { match: /pharm/i, subjects: [
    sub("Pharmaceutics", 9, "Hard"), sub("Pharmacology", 9, "Hard"),
    sub("Pharmaceutical Chemistry", 9, "Hard"), sub("Pharmacognosy", 7)] },
  { match: /\bmbbs|medical|medicine|neet ?pg/i, subjects: [
    sub("Anatomy", 10, "Hard"), sub("Physiology", 10, "Hard"), sub("Biochemistry", 9, "Hard"),
    sub("Pathology", 9, "Hard"), sub("Pharmacology", 9, "Hard")] },
  { match: /\bllb|\bllm|law|legal|clat|judiciary/i, subjects: [
    sub("Constitutional Law", 10, "Hard"), sub("Law of Contract", 8),
    sub("Criminal Law", 9, "Hard"), sub("Law of Torts", 7), sub("Legal Reasoning", 8)] },
  { match: /mechanical/i, subjects: [
    sub("Engineering Mechanics", 9, "Hard"), sub("Thermodynamics", 9, "Hard"),
    sub("Fluid Mechanics", 8, "Hard"), sub("Strength of Materials", 8, "Hard"),
    sub("Manufacturing", 7)] },
  { match: /civil engineer|\bce\b.*(gate|btech|diploma)|structural engineer/i, subjects: [
    sub("Structural Analysis", 9, "Hard"), sub("Geotechnical Engineering", 8, "Hard"),
    sub("Fluid Mechanics", 8, "Hard"), sub("Surveying", 7), sub("Building Materials", 7)] },
  { match: /electrical|\beee\b/i, subjects: [
    sub("Electrical Machines", 9, "Hard"), sub("Power System", 9, "Hard"),
    sub("Control System", 8, "Hard"), sub("Network Theory", 8, "Hard"),
    sub("Power Electronics", 7, "Hard")] },
  { match: /electronic|\bece\b|communication engineering|vlsi/i, subjects: [
    sub("Signals & Systems", 9, "Hard"), sub("Analog Electronics", 8, "Hard"),
    sub("Digital Logic", 8), sub("Communication Systems", 9, "Hard"),
    sub("Control System", 7, "Hard")] },
  { match: /data science|machine learning|artificial intelligence|\bai\b|\bml\b|analytics/i, subjects: [
    sub("Python", 8), sub("Statistics", 9, "Hard"), sub("Machine Learning", 10, "Hard"),
    sub("Data Visualisation", 6, "Easy"), sub("Database", 7), sub("Big Data", 7, "Hard")] },
  { match: /cyber|security|hacking/i, subjects: [
    sub("Security", 8, "Hard"), sub("Computer Networks", 8), sub("Ethical Hacking", 9, "Hard"),
    sub("Cryptography", 7, "Hard")] },
  { match: /cloud|devops|aws|azure/i, subjects: [
    sub("Cloud", 8), sub("Computer Networks", 7), sub("Security", 7, "Hard"),
    sub("Operating System", 7, "Hard")] },
  { match: /computer|software|\bit\b|informatics|\bcse\b|\bbca\b|\bmca\b|programming|coding/i, subjects: [
    sub("Data Structures", 10, "Hard"), sub("Operating System", 8, "Hard"),
    sub("Database", 8), sub("Computer Networks", 7), sub("Algorithms", 8, "Hard")] },
  // === NMIMS EXACT RAG REPLACEMENT RULE HERE ===
  { match: /nmims|cdoe|nga-sce|online.*mba.*marketing|distance.*mba.*marketing/i, subjects: [
    sub("Business Communication", 12, "Medium"), sub("Financial Accounting", 12, "Hard"),
    sub("Micro Economics & Macro Economics", 12, "Hard"), sub("Organizational Behavior", 16, "Medium"),
    sub("Marketing Management", 12, "Medium"), sub("Quantitative Methods - I", 12, "Hard"),
    sub("Cost & Management Accounting", 8, "Hard"), sub("Human Resource Management", 7, "Medium"),
    sub("Strategic Management", 8, "Hard"), sub("Business Analytics", 8, "Hard"),
    sub("Legal Aspect of Business", 7, "Medium"), sub("Operations Management", 8, "Medium"),
    sub("Corporate Finance", 8, "Hard"), sub("Research Methodology", 8, "Hard"),
    sub("Project Part I", 6, "Medium"), sub("Brand Management", 8, "Hard"),
    sub("Consumer Behaviour", 9, "Hard"), sub("Integrated Marketing Communications", 8, "Hard"),
    sub("Sales Management", 8, "Medium"), sub("Indian Ethos & Ethics", 6, "Easy"),
    sub("Corporate Sustainability", 7, "Medium"), sub("International Business", 7, "Medium"),
    sub("Project Part II", 5, "Hard"), sub("International Marketing", 8, "Hard"),
    sub("Services Marketing", 8, "Medium"), sub("Digital Marketing", 9, "Hard")
  ] },
  { match: /mba.*(finance|fintech|banking)|finance.*mba/i, subjects: [
    sub("Corporate Finance", 9, "Hard"), sub("Financial Management", 9, "Hard"),
    sub("Investment Analysis & Portfolio Mgmt", 8, "Hard"), sub("Financial Markets & Institutions", 7, "Medium"),
    sub("Cost & Management Accounting", 8, "Hard"), sub("Strategic Management", 7, "Hard"),
    sub("Business Analytics", 7, "Hard"), sub("International Finance", 7, "Hard")] },
  { match: /mba.*(hr|human resource)|hr.*mba/i, subjects: [
    sub("Human Resource Management", 9, "Medium"), sub("Organizational Behavior", 8, "Medium"),
    sub("Industrial & Labour Relations", 7, "Medium"), sub("Compensation & Benefits", 7, "Hard"),
    sub("Talent Acquisition & Development", 7, "Medium"), sub("Strategic Management", 7, "Hard"),
    sub("HR Analytics", 6, "Hard")] },
  { match: /mba.*(operation|supply chain|logistics)|operations.*mba/i, subjects: [
    sub("Operations Management", 9, "Hard"), sub("Supply Chain Management", 9, "Hard"),
    sub("Quality Management & Six Sigma", 7, "Hard"), sub("Project Management", 7, "Medium"),
    sub("Business Analytics", 7, "Hard"), sub("Strategic Management", 7, "Hard")] },
  { match: /mba.*(marketing|brand|sales|digital)|marketing.*mba|distance.*mba/i, subjects: [
    sub("Marketing Management", 9, "Hard"), sub("Consumer Behaviour", 8, "Hard"),
    sub("Brand Management", 8, "Hard"), sub("Sales & Distribution Management", 8, "Medium"),
    sub("Digital Marketing & Analytics", 8, "Hard"), sub("Marketing Research", 7, "Hard"),
    sub("Services Marketing", 7, "Medium"), sub("Strategic Management", 7, "Hard")] },
  { match: /\bmba|management|bba|pgdm/i, subjects: [
    sub("Management", 8), sub("Marketing", 8), sub("Finance", 9, "Hard"),
    sub("Human Resource", 7), sub("Operations", 8), sub("Statistics", 8, "Hard")] },
  { match: /\bca\b|chartered accountan|\bcma\b|\bcs\b executive|cost accounting|commerce|\bb\.?com|\bm\.?com/i, subjects: [
    sub("Accounting", 10, "Hard"), sub("Cost Accounting", 9, "Hard"),
    sub("Taxation", 9, "Hard"), sub("Law", 8), sub("Auditing", 8), sub("Economics", 8)] },
  { match: /\bcfa\b|\bfrm\b|finance|investment|banking exam/i, subjects: [
    sub("Financial Statement", 9, "Hard"), sub("Finance", 9, "Hard"),
    sub("Equity", 8, "Hard"), sub("Quantitative Methods", 8, "Hard"),
    sub("Ethical Standards", 6)] },
  { match: /economic/i, subjects: [
    sub("Microeconomic Theory", 9, "Hard"), sub("Macroeconomic Theory", 9, "Hard"),
    sub("Econometrics", 9, "Hard"), sub("Statistics", 8, "Hard"), sub("Indian Economy", 7)] },
  { match: /psycholog/i, subjects: [
    sub("General Psychology", 8, "Easy"), sub("Developmental Psychology", 7),
    sub("Cognitive Psychology", 8, "Hard"), sub("Abnormal Psychology", 8),
    sub("Statistics", 7, "Hard")] },
  { match: /upsc|civil service|\bias\b|\bips\b|\bpcs\b|state psc|mpsc|bpsc|uppsc/i, subjects: [
    sub("Indian Polity & Governance", 12, "Hard"), sub("Modern & Post-Independence History", 10, "Hard"),
    sub("Art, Culture & Ancient/Medieval History", 8, "Medium"), sub("Indian & World Geography", 10, "Hard"),
    sub("Indian Economy", 10, "Hard"), sub("Environment & Ecology", 7, "Medium"),
    sub("Science & Technology", 7, "Medium"), sub("Current Affairs", 10, "Medium"),
    sub("Ethics, Integrity & Aptitude (GS-IV)", 7, "Hard"), sub("CSAT (Prelims Paper II)", 6, "Medium")] },
  { match: /\bssc\b|\bcgl\b|\bchsl\b|\bmts\b|ssc gd/i, subjects: [
    sub("Quantitative Aptitude", 12, "Hard"), sub("Reasoning & General Intelligence", 11, "Medium"),
    sub("English Language & Comprehension", 10, "Medium"), sub("General Awareness", 10, "Easy")] },
  { match: /\brrb\b|railway|\bntpc\b|\balp\b|group ?d/i, subjects: [
    sub("Mathematics", 11, "Medium"), sub("General Intelligence & Reasoning", 10, "Medium"),
    sub("General Awareness & Current Affairs", 9, "Easy"), sub("General Science", 9, "Medium")] },
  { match: /bank ?po|\bibps\b|\bsbi\b|clerk|\brbi\b|banking exam/i, subjects: [
    sub("Quantitative Aptitude", 11, "Hard"), sub("Reasoning Ability", 11, "Hard"),
    sub("English Language", 9, "Medium"), sub("General & Banking Awareness", 10, "Medium"),
    sub("Computer Aptitude", 6, "Easy")] },
  { match: /\bgate\b/i, subjects: [
    sub("Engineering Mathematics", 9, "Hard"), sub("Core Subject — Part A", 12, "Hard"),
    sub("Core Subject — Part B", 12, "Hard"), sub("General Aptitude", 6, "Medium"),
    sub("Previous Year Problem Solving", 8, "Hard")] },
  { match: /\bcat\b|\bxat\b|\bmat\b|\bsnap\b|\bnmat\b|mba entrance/i, subjects: [
    sub("Quantitative Ability", 12, "Hard"), sub("Verbal Ability & Reading Comprehension", 10, "Hard"),
    sub("Data Interpretation & Logical Reasoning", 11, "Hard"), sub("Mock Test Analysis", 6, "Medium")] },
  { match: /\bjee\b|\biit\b|bitsat|\bcet\b|engineering entrance/i, subjects: [
    sub("Physics", 14, "Hard"), sub("Mathematics", 15, "Hard"),
    sub("Physical Chemistry", 8, "Hard"), sub("Organic Chemistry", 9, "Hard"),
    sub("Inorganic Chemistry", 7)] },
  { match: /\bneet\b|aiims|medical entrance/i, subjects: [
    sub("Botany", 11), sub("Zoology", 11, "Hard"), sub("Physics", 13, "Hard"),
    sub("Physical Chemistry", 8, "Hard"), sub("Organic Chemistry", 8, "Hard"),
    sub("Inorganic Chemistry", 7)] },
  { match: /\bgate\b|\bnet\b|\bjrf\b|ugc/i, subjects: [
    sub("Engineering Mathematics", 9, "Hard"), sub("Core Subject Theory", 12, "Hard"),
    sub("Core Subject Applications", 10, "Hard"), sub("Previous Year Analysis", 6)] },
  { match: /ielts|toefl|pte|duolingo|english proficiency/i, subjects: [
    sub("Listening", 7), sub("Reading", 7), sub("Writing Task", 8, "Hard"),
    sub("Speaking", 7), sub("English", 6, "Easy")] },
  { match: /\bgre\b|\bgmat\b/i, subjects: [
    sub("Quantitative Aptitude", 10, "Hard"), sub("Verbal Ability", 9, "Hard"),
    sub("Writing Task", 5), sub("Mock Test", 6)] },
  { match: /b\.?ed|teacher|\bctet\b|\btet\b|education/i, subjects: [
    sub("Teaching", 9), sub("Developmental Psychology", 8),
    sub("English", 7, "Easy"), sub("Mathematics", 8), sub("Environmental", 7, "Easy")] },
  { match: /architect/i, subjects: [
    sub("Architectural Design", 10, "Hard"), sub("Building Materials", 8),
    sub("Structural Analysis", 8, "Hard"), sub("History", 7)] },
  { match: /hotel|hospitality|culinary|chef/i, subjects: [
    sub("Food Production", 8), sub("Food & Beverage Service", 7),
    sub("Front Office", 7, "Easy"), sub("Accounting", 6)] },
  { match: /journalis|mass comm|media/i, subjects: [
    sub("Journalism", 8), sub("English", 7), sub("Media Laws", 7), sub("Current Affairs", 7)] },
  { match: /social work|\bmsw\b/i, subjects: [
    sub("Social Work", 8), sub("Research Methodology", 7, "Hard"),
    sub("Psychology", 7), sub("Social Policy", 7)] },
  { match: /phd|doctoral|m\.?phil|research schol/i, subjects: [
    sub("Literature Review", 8, "Hard"), sub("Research Methodology", 7, "Hard"),
    sub("Statistics", 8, "Hard"), sub("Thesis", 8, "Hard"), sub("Core Domain Theory", 9, "Hard")] },
  { match: /physics/i, subjects: [
    sub("Classical Mechanics", 9, "Hard"), sub("Electromagnetism", 9, "Hard"),
    sub("Quantum", 8, "Hard"), sub("Thermodynamics", 8, "Hard"),
    sub("Mathematical Physics", 8, "Hard")] },
  { match: /chemistry/i, subjects: [
    sub("Physical Chemistry", 9, "Hard"), sub("Organic Chemistry", 10, "Hard"),
    sub("Inorganic Chemistry", 9), sub("Analytical Chemistry", 7)] },
  { match: /biolog|life science|bio-?tech|zoolog|botan/i, subjects: [
    sub("Cell Biology", 8), sub("Genetics", 8, "Hard"), sub("Botany", 8),
    sub("Zoology", 8), sub("Biochemistry", 8, "Hard"), sub("Microbiology", 7)] },
  { match: /mathemat|\bmaths\b|statistic/i, subjects: [
    sub("Real Analysis", 9, "Hard"), sub("Abstract Algebra", 9, "Hard"),
    sub("Linear Algebra", 8, "Hard"), sub("Differential Equations", 8, "Hard"),
    sub("Statistics", 8, "Hard")] },
  { match: /english|literature|linguistic/i, subjects: [
    sub("Poetry", 8), sub("Literature", 9), sub("Criticism", 8, "Hard"),
    sub("Linguistics", 7, "Hard"), sub("English", 7, "Easy")] },
  { match: /histor/i, subjects: [
    sub("Ancient History", 9), sub("Medieval History", 8), sub("Modern History", 9),
    sub("World History", 8), sub("Historiography", 6, "Hard")] },
  { match: /political|polity|governance|public administration/i, subjects: [
    sub("Political Theory", 8), sub("Polity", 9, "Hard"),
    sub("Comparative Politics", 8, "Hard"), sub("International Relations", 8)] },
  { match: /geograph/i, subjects: [
    sub("Geography", 10), sub("Environment", 7, "Easy"), sub("Statistics", 6)] },
  { match: /sociolog|anthropolog/i, subjects: [
    sub("Sociological Theory", 9, "Hard"), sub("Indian Society", 8),
    sub("Research Methodology", 7, "Hard"), sub("Social Change & Development", 7)] },
];

const CLASS_SETS: Record<string, SeedSubject[]> = {
  primary: [sub("English", 7, "Easy"), sub("Mathematics", 8, "Easy"),
    sub("Environmental", 7, "Easy"), sub("Hindi", 6, "Easy"), sub("Computer", 4, "Easy")],
  middle: [sub("Mathematics", 10), sub("Science", 10), sub("Social Science", 9),
    sub("English", 8, "Easy"), sub("Hindi", 6, "Easy")],
  senior: [sub("Mathematics", 13, "Hard"), sub("Science", 13, "Hard"),
    sub("Social Science", 12), sub("English", 10), sub("Computer", 6, "Easy")],
};

function nameDerived(courseName: string): SeedSubject[] {
  const clean = (courseName || "Your Course")
    .replace(/\b(diploma|certificate|course|program(me)?|training|in|of|the|for|\d+(st|nd|rd|th)?\s*year|semester)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const topic = (clean || "Your Course").replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 42);
  return [
    sub(`${topic} — Foundations`, 7, "Easy"),
    sub(`${topic} — Core Theory`, 9, "Hard"),
    sub(`${topic} — Techniques & Methods`, 8),
    sub(`${topic} — Applications & Case Studies`, 7),
    sub(`${topic} — Practice & Assessment`, 6),
  ];
}

export function synthesiseSubjects(courseName: string, level: string): SeedSubject[] {
  const q = (courseName || "").trim();
  let picked: SeedSubject[] | null = null;

  const isResearch = /\bphd\b|doctoral|m\.?phil|research schol/i.test(q);

  let matchedNmims = false;
  if (!picked && !isResearch) {
    const discipline = RULES.find((r) => r.match.test(q));
    if (discipline) {
      picked = discipline.subjects.map((x) => ({ ...x }));
      matchedNmims = /nmims|cdoe/i.test(discipline.match.source);
    }
  }

  if (!picked) {
    const m = q.match(/(?:class|grade|std|standard)\s*(\d{1,2})/i);
    if (m) {
      const n = Number(m[1]);
      const stream = /commerce/i.test(q) ? "commerce" : /art|humanit/i.test(q) ? "arts"
        : /pcb|bio/i.test(q) ? "pcb" : /pcm|math/i.test(q) ? "pcm" : "";
      if (n >= 11 && stream === "commerce") picked = COURSE_DB.class_12_commerce.subjects.map((x) => ({ ...x }));
      else if (n >= 11 && stream === "arts") picked = COURSE_DB.class_12_arts.subjects.map((x) => ({ ...x }));
      else if (n >= 11 && stream === "pcb") picked = COURSE_DB.class_12_pcb.subjects.map((x) => ({ ...x }));
      else if (n >= 11) picked = COURSE_DB.class_12_pcm.subjects.map((x) => ({ ...x }));
      else if (n >= 9) picked = CLASS_SETS.senior.map((x) => ({ ...x }));
      else if (n >= 6) picked = CLASS_SETS.middle.map((x) => ({ ...x }));
      else picked = CLASS_SETS.primary.map((x) => ({ ...x }));
    }
  }

  if (!picked) {
    const nq = normalise(q);
    if (nq.length > 2) {
      const hit = Object.values(COURSE_DB).find(
        (c) => normalise(c.name) === nq || normalise(c.name).includes(nq) || nq.includes(normalise(c.name))
      );
      if (hit) picked = hit.subjects.map((x) => ({ ...x }));
    }
  }

  if (!picked && isResearch) {
    const discipline = RULES.find((r) => r.match.test(q) && !/phd|doctoral/.test(r.match.source));
    const base = discipline ? discipline.subjects.slice(0, 3).map((x) => ({ ...x })) : [];
    picked = [
      ...base,
      sub("Literature Review", 8, "Hard"),
      sub("Research Methodology", 7, "Hard"),
      sub("Statistics", 7, "Hard"),
      sub("Thesis", 8, "Hard"),
    ];
  }

  if (!picked) {
    const fallbackByLevel: Record<string, SeedSubject[]> = {
      nursery: RULES[0].subjects,
      school: CLASS_SETS.middle,
      diploma: COURSE_DB.polytechnic_it.subjects,
      ug: nameDerived(q),
      pg: [sub("Advanced Core Theory", 10, "Hard"), sub("Specialisation Paper", 9, "Hard"),
        sub("Research Methodology", 7, "Hard"), sub("Dissertation / Project", 8, "Hard")],
      phd: RULES.find((r) => r.match.test("phd"))!.subjects,
      competitive: [sub("Core Subject Theory", 12, "Hard"), sub("Quantitative Aptitude", 10),
        sub("Reasoning", 9), sub("General Awareness", 8, "Easy"), sub("Mock Test", 6)],
      professional: [sub("Core Body of Knowledge", 10, "Hard"), sub("Applications & Cases", 9, "Hard"),
        sub("Regulations & Standards", 8), sub("Mock Test", 6)],
    };
    picked = (fallbackByLevel[level] || nameDerived(q)).map((x) => ({ ...x }));
  }

  if (picked) {
    let list: SeedSubject[] = applySpecialisation(q, picked);
    const hasExplicitSem = !!(detectSemester(q).sem || detectSemester(q).year);
    const filterQuery = matchedNmims && !hasExplicitSem ? `${q} semester 1` : q;
    list = applySemesterFilter(filterQuery, list);
    picked = list;
  }

  const seen = new Set<string>();
  return picked
    .filter((x) => {
      const k = normalise(x.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 28)
    .map((x, i) => ({
      ...x,
      color: x.color && x.color !== "#6366f1" ? x.color : PALETTE[i % PALETTE.length],
    }));
}

const NMIMS_SEMESTER: Record<string, number> = {
  "business communication": 1, "financial accounting": 1, "micro economics & macro economics": 1,
  "organizational behavior": 1, "marketing management": 1, "quantitative methods - i": 1,
  "cost & management accounting": 2, "human resource management": 2, "strategic management": 2,
  "business analytics": 2, "legal aspect of business": 2, "operations management": 2,
  "corporate finance": 3, "research methodology": 3, "project part i": 3,
  "brand management": 3, "consumer behaviour": 3, "integrated marketing communications": 3,
  "sales management": 3, "indian ethos & ethics": 4, "corporate sustainability": 4,
  "international business": 4, "project part ii": 4, "international marketing": 4,
  "services marketing": 4, "digital marketing": 4,
};

export function detectSemester(q: string): { sem?: number; year?: number } {
  const semMatch = q.match(/\b(?:sem(?:ester)?)\s*[-:]?\s*(\d)\b/i) || q.match(/\b(\d)(?:st|nd|rd|th)?\s*sem(?:ester)?\b/i);
  const yearMatch = q.match(/\b(?:year)\s*[-:]?\s*(\d)\b/i) || q.match(/\b(\d)(?:st|nd|rd|th)?\s*year\b/i);
  const sem = semMatch ? Number(semMatch[1]) : undefined;
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  return { sem: sem && sem >= 1 && sem <= 8 ? sem : undefined, year: year && year >= 1 && year <= 4 ? year : undefined };
}

const SPECIALISATION_PAPERS: Array<{ re: RegExp; subjects: SeedSubject[] }> = [
  { re: /\bpsir\b|political science.*international/i, subjects: [
    sub("PSIR Paper I: Political Theory", 9, "Hard"), sub("PSIR Paper II: International Relations", 9, "Hard")] },
  { re: /\bsociolog/i, subjects: [sub("Sociology Paper I", 9, "Hard"), sub("Sociology Paper II: Indian Society", 9, "Hard")] },
  { re: /\bgeograph/i, subjects: [sub("Geography Optional Paper I", 9, "Hard"), sub("Geography Optional Paper II", 9, "Hard")] },
  { re: /\bhistor/i, subjects: [sub("History Optional Paper I", 9, "Hard"), sub("History Optional Paper II", 9, "Hard")] },
  { re: /\bpub(lic)? ?ad/i, subjects: [sub("Public Administration Paper I", 9, "Hard"), sub("Public Administration Paper II", 9, "Hard")] },
  { re: /\banthropolog/i, subjects: [sub("Anthropology Paper I", 9, "Hard"), sub("Anthropology Paper II", 9, "Hard")] },
  { re: /gate.*\bcse?\b|cse?.*gate|computer science.*gate/i, subjects: [
    sub("Data Structures & Algorithms", 10, "Hard"), sub("Operating Systems", 8, "Hard"),
    sub("DBMS", 8, "Hard"), sub("Computer Networks", 8, "Hard"), sub("Theory of Computation", 8, "Hard"),
    sub("Digital Logic & COA", 8, "Hard")] },
  { re: /gate.*\bece\b|ece.*gate|electronics.*gate/i, subjects: [
    sub("Networks & Signals", 9, "Hard"), sub("Analog Circuits", 8, "Hard"),
    sub("Digital Circuits", 8, "Hard"), sub("Communications", 9, "Hard"), sub("Electromagnetics", 8, "Hard")] },
  { re: /gate.*\b(me|mechanical)\b|mechanical.*gate/i, subjects: [
    sub("Engineering Mechanics", 8, "Hard"), sub("Strength of Materials", 8, "Hard"),
    sub("Thermodynamics", 9, "Hard"), sub("Fluid Mechanics", 8, "Hard"), sub("Manufacturing", 8, "Hard")] },
];

function applySpecialisation(q: string, subjectsList: SeedSubject[]): SeedSubject[] {
  if (!/optional|specialis|paper|gate/i.test(q)) return subjectsList;
  for (const { re, subjects } of SPECIALISATION_PAPERS) {
    if (re.test(q)) {
      const names = new Set(subjects.map((s) => normalise(s.name)));
      return [...subjects.map((s) => ({ ...s })), ...subjectsList.filter((s) => !names.has(normalise(s.name)))];
    }
  }
  return subjectsList;
}

function applySemesterFilter(q: string, subjectsList: SeedSubject[]): SeedSubject[] {
  const { sem, year } = detectSemester(q);
  if (!sem && !year) return subjectsList;
  const wanted = sem ? [sem] : year ? [year * 2 - 1, year * 2] : [];
  if (!wanted.length) return subjectsList;
  const tagged = subjectsList.filter((s) => wanted.includes(NMIMS_SEMESTER[normalise(s.name)]));
  return tagged.length >= 3 ? tagged : subjectsList;
}
