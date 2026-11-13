// The site guide lives in one place so the Start page, the guide drawer and the
// navigation always agree.

export type Group = 'discover' | 'analyse' | 'report'
export type Feature = { n: number; path: string; name: string; short?: string; group: Group; what: string; tips: string[] }

export const GROUPS: { id: Group; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'report', label: 'Report & sources' },
]

export const FEATURES: Feature[] = [
  {
    n: 1, path: '/explorer', name: 'Research Explorer', short: 'Explorer', group: 'discover',
    what: 'Find NASA combustion experiments and read what each one studied.',
    tips: [
      'Pick a habitat at the top (Moon Base, space station…) to get a briefing on its fire-safety needs and research gaps.',
      'Use the side filters for fuel, material, oxygen level, gravity and more.',
      'If nothing matches, the page shows the closest experiments and offers an AI estimate.',
      'Open any experiment for its full NASA record, test conditions, run tables and source links.',
    ],
  },
  {
    n: 2, path: '/assistant', name: 'AI Research Assistant', short: 'AI workbench', group: 'discover',
    what: 'Research tasks answered from NASA reports, with a citation on every statement.',
    tips: [
      'The assistant is also docked on every page: press “Ask AI” at the top right, or select any text to ask about it.',
      'Switch between “Student” and “Expert” wording.',
      'Numbered chips open the exact NASA passage, with its document and page.',
      'Download the conversation as a PDF report with references.',
    ],
  },
  {
    n: 3, path: '/insights', name: 'Fire Safety Insights', short: 'Fire Safety Insights', group: 'discover',
    what: 'What the research says about preventing, detecting and putting out fires in space, with a 10-question quiz.',
    tips: [
      'Start with the quiz at the top to check what you know, or take it after reading.',
      'Each point shows the NASA quote it rests on, the conditions that were tested, and its limits.',
    ],
  },
  {
    n: 4, path: '/lessons', name: 'Lessons & Applications', short: 'Lessons & Applications', group: 'discover',
    what: 'Past spacecraft fires, Earth vs. microgravity, next-generation equipment and uses on Earth.',
    tips: [
      'Quiz 2 at the top: ten questions on this page.',
      'A timeline of Apollo 1, Apollo 13 and the Mir fire, with what NASA changed afterwards.',
      'Small charts summarise the evidence; NASA photos show the experiments.',
    ],
  },
  {
    n: 5, path: '/charts', name: 'Charts', group: 'analyse',
    what: 'Build your own chart from NASA’s test tables, or upload your own CSV.',
    tips: [
      'Build a chart: pick a NASA run table, then the chart type and the measurements.',
      'Upload a CSV of your own data to chart it the same way.',
      '“Where has NASA tested?” plots every test against the habitat atmospheres.',
      'Hover a point for its values; download the chart or the data.',
    ],
  },
  {
    n: 6, path: '/ranking', name: 'Experiment Ranking', short: 'Ranking', group: 'analyse',
    what: 'A relevance score for every experiment, for a habitat or a question of your own.',
    tips: [
      'Choose a habitat and, if you like, a safety focus.',
      'Each score bar shows how much every factor contributes to it.',
      'Move the weight sliders to say what matters to you; the scores update at once.',
      'Type your own criterion to have the AI score the experiments against it.',
    ],
  },
  {
    n: 7, path: '/compare', name: 'Experiment Comparison', short: 'Compare', group: 'analyse',
    what: 'Put two to four experiments side by side.',
    tips: [
      'Add experiments here, or with “+ Compare” on any experiment card.',
      'Shared rows are marked, differences are highlighted, and “Not reported” marks information NASA’s record does not give.',
    ],
  },
  {
    n: 8, path: '/whatif', name: 'Predictions', short: 'Predictions', group: 'analyse',
    what: 'Three questions from NASA experiments, for any habitat: burning speed, flame-out chance, flame heat.',
    tips: [
      'Pick a question, then a place (Moon Base, Mars Base…), then fine-tune the conditions.',
      'The shaded strip on each slider is the range NASA tested; gas sliders never let the mixture pass 100%.',
      'A confidence score appears when the scenario is close to real tests; otherwise the answer is marked a rough estimate.',
      'Upload a CSV to predict many scenarios at once and download the results.',
    ],
  },
  {
    n: 9, path: '/gaps', name: 'Research Gaps', group: 'analyse',
    what: 'What NASA has studied, and where information is missing or thin.',
    tips: [
      'The bar at the top always shows which experiments and filters the counts are based on.',
      'Red and striped means no PSI combustion investigation covers it: a research gap.',
      'Use the coverage map to cross two conditions, for example what was burned against oxygen level.',
      'Pick a habitat to see how many experiments reach its atmosphere and gravity.',
    ],
  },
  {
    n: 10, path: '/mission', name: 'Mission Report', group: 'report',
    what: 'A full fire-safety report for one habitat, with references, as a PDF.',
    tips: [
      'Choose the habitat and, if you like, a safety focus.',
      'The preview is built from the same data as the other sections, so the numbers always agree.',
      'Download the PDF to share it; every statement carries its NASA source.',
    ],
  },
  {
    n: 11, path: '/resources', name: 'NASA Resources', group: 'report',
    what: 'The ten official NASA resources for this challenge, and where the site uses each one.',
    tips: [
      'Each card shows NASA’s own description, what was read, and links to the pages that quote it.',
      'Watch the NASA ScienceCast video here; its transcript comes from NASA’s caption file.',
      'Apollo 1, Apollo 13 and Mir are history, not experiments: their lessons are on the Lessons & Applications page.',
    ],
  },
]

export const COMING: string[] = []

export type Step = { text: string; to: string }
export type Path = { id: string; who: string; title: string; steps: Step[] }

/** One plan per reader the site is built for. */
export const PATHS: Path[] = [
  {
    id: 'undergrad', who: 'Undergraduate students', title: 'Understand the basics, then test yourself',
    steps: [
      { text: 'Watch NASA’s 3-minute video on why it studies fire in space', to: '/resources#RES-3' },
      { text: 'Read why flames behave differently without gravity', to: '/lessons#gravity' },
      { text: 'Read the prevention, detection and suppression insights', to: '/insights' },
      { text: 'Take the 10-question quiz', to: '/insights?quiz=1' },
      { text: 'Look at a real measurement chart', to: '/charts?preset=flex-burn-o2' },
    ],
  },
  {
    id: 'grad', who: 'Graduate students & researchers', title: 'Find, compare and cite the evidence',
    steps: [
      { text: 'Filter experiments by material, fuel, oxygen level or topic', to: '/explorer' },
      { text: 'Ask for a findings brief, cited to NASA reports by page', to: '/assistant' },
      { text: 'Compare the experiments that matter side by side', to: '/compare?ids=PSI-25,PSI-26' },
      { text: 'Chart a NASA run table, or upload your own data to set beside it', to: '/charts' },
      { text: 'Find the research gaps worth a proposal', to: '/gaps' },
    ],
  },
  {
    id: 'engineer', who: 'Aerospace engineers', title: 'Start from the habitat',
    steps: [
      { text: 'Choose your habitat and read its fire-safety briefing', to: '/explorer?env=moon' },
      { text: 'Score the experiments for that habitat', to: '/ranking?env=moon' },
      { text: 'See how far NASA’s tests reach toward your cabin atmosphere', to: '/charts?view=envelope' },
      { text: 'Estimate a burning rate at your atmosphere, with its confidence', to: '/whatif?fuel=Methanol&o2=30&co2=0&he=0&p=0.69&d=3' },
      { text: 'Download the mission report with references', to: '/mission?env=moon' },
    ],
  },
  {
    id: 'professor', who: 'Professors', title: 'Teach with real NASA data',
    steps: [
      { text: 'Use the Apollo 1, Apollo 13 and Mir timeline as a case study', to: '/lessons#lessons' },
      { text: 'Set the insights quiz as a check after a lecture', to: '/insights?quiz=1' },
      { text: 'Give students a NASA run table to chart', to: '/charts?view=build' },
      { text: 'Show how a model’s confidence falls outside the data', to: '/whatif' },
      { text: 'Discuss open questions from the research gaps', to: '/gaps' },
    ],
  },
]

// The demo story from the project guide: researching fire safety for a Moon Base.
export const TOUR: Step[] = [
  { text: 'Select “Moon Base” as the mission environment', to: '/explorer?env=moon' },
  { text: 'Find experiments on solid-material flammability', to: '/explorer?env=moon&fuel_state=solid' },
  { text: 'Open BASS-II and read its research objective', to: '/explorer/PSI-25' },
  { text: 'Ask the assistant which other experiments are related', to: '/assistant?q=Which%20other%20experiments%20are%20related%20to%20BASS-II%2C%20and%20how%3F' },
  { text: 'Compare two investigations', to: '/compare?ids=PSI-25,PSI-99' },
  { text: 'Fire Safety Insights: why oxygen and material choice matter', to: '/insights#prevention' },
  { text: 'See the Earth vs. microgravity explanation', to: '/lessons#gravity' },
  { text: 'Open a chart made from real NASA measurements', to: '/charts?preset=flex-burn-o2' },
  { text: 'Try a What-If scenario: a fuel droplet at Moon Base oxygen and pressure', to: '/whatif?fuel=Methanol&o2=30&co2=0&he=0&p=0.69&d=3' },
  { text: 'Generate the Moon Base mission report with references', to: '/mission?env=moon' },
]

export function featureFor(pathname: string): Feature | undefined {
  return FEATURES.filter((f) => pathname === f.path || pathname.startsWith(f.path + '/')).sort((a, b) => b.path.length - a.path.length)[0]
}
