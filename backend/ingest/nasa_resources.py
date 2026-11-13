"""The official NASA resources listed for the "Flame in Freefall" challenge.

The list, the order and the descriptions are the ones the challenge organisers published
("Official NASA Resources"). Each description is kept word for word and shown on the site as
NASA's. The fields added by this project say how the resource is fetched and where the site
uses it.

  fetch.page      the web page itself, read as text
  fetch.pdfs      "linked": every PDF the page's article links to on nasa.gov
  fetch.captions  NASA's own caption file for a video (from images.nasa.gov)
  fetch.ntrs      the full article on NASA's Technical Reports Server that a Spinoff page points to
  drop_sections   headings whose text is left out, with the reason given in `note`
"""

RESOURCES = [
    {
        "id": "RES-1", "slug": "psi", "kind": "data",
        "short": "PSI Data Repository",
        "title": "PSI Data Repository: Combustion Science",
        "url": "https://psi.nasa.gov/physci/repo/search?q=combustion",
        "description": "Physical Sciences Informatics (PSI) source of the data upon which the NASA Space App is to be based.",
        "topic": "data",
        "fetch": {},  # downloaded by fetch_psi.py and fetch_docs.py: this is the site's whole database
    },
    {
        "id": "RES-2", "slug": "glenn-combustion", "kind": "overview",
        "short": "NASA Combustion Science",
        "title": "NASA Combustion Science",
        "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
        "description": "Basic information about most of the combustion investigations for which data is found in the PSI Data Repository.",
        "topic": "science",
        "fetch": {"page": True, "pdfs": "linked"},
        "stop_at": ["Discover More Topics From NASA"],
    },
    {
        "id": "RES-3", "slug": "sciencecast", "kind": "video",
        "short": "ScienceCast: Combustion on the ISS",
        "title": "NASA ScienceCasts: The Power of Studying Combustion on the ISS",
        "url": "https://www.youtube.com/watch?v=W1oXykoz9zg",
        "description": "Introduction to NASA’s combustion research on the International Space Station through a 3.6-minute video clip from 2018.",
        "topic": "science",
        "video": {"youtube_id": "W1oXykoz9zg", "nasa_id": "264_StudyingCombustionOnTheISS",
                  "nasa_page": "https://images.nasa.gov/details/264_StudyingCombustionOnTheISS"},
        "fetch": {"captions": "https://images-assets.nasa.gov/video/264_StudyingCombustionOnTheISS/264_StudyingCombustionOnTheISS.srt"},
    },
    {
        "id": "RES-4", "slug": "researchers-guide", "kind": "review",
        "short": "Researcher’s Guide",
        "title": "A Researcher’s Guide to International Space Station Combustion Science",
        "url": "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/",
        "description": "A 2015 review of NASA’s combustion research conducted on, or planned for, the International Space Station. Basic information about most of the combustion investigations described in this 50+ page document is found within the PSI Data Repository.",
        "topic": "science",
        "fetch": {"page": True, "pdfs": "linked"},
        "stop_at": ["Discover More Topics From NASA"],
    },
    {
        "id": "RES-5", "slug": "apollo-1", "kind": "history",
        "short": "Apollo 1",
        "title": "Apollo 1",
        "url": "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1",
        "description": "Information about the crew mission, fire that erupted during a pre-launch test killing the crew, investigation, and lessons learned.",
        "topic": "lessons",
        "fetch": {"page": True},
    },
    {
        "id": "RES-6", "slug": "apollo-13", "kind": "history",
        "short": "Apollo 13",
        "title": "Apollo 13",
        "url": "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13",
        "description": "Information about the crew, mission, oxygen tank explosion that occurred during the flight to the Moon, investigation, and lessons learned.",
        "topic": "lessons",
        "fetch": {"page": True},
        "drop_sections": ["AS-204 Mission"],
        "note": "NASA’s Apollo 13 page carries, in a pop-up, a copy of the Apollo 1 (AS-204) mission summary. "
                "That block is left out here; the same text is read from the Apollo 1 page.",
    },
    {
        "id": "RES-7", "slug": "mir-fire", "kind": "history",
        "short": "Mir fire, 1997",
        "title": "25 Years Ago: Fire Aboard Space Station Mir",
        "url": "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/",
        "description": "Basic information about a fire—caused by an oxygen generator failure—that erupted within the Russian space station Mir in 1997 during joint operations in preparation for the International Space Station (first occupied in 2000).",
        "topic": "lessons",
        "fetch": {"page": True},
        "stop_at": ["Discover More Topics From NASA"],
    },
    {
        "id": "RES-8", "slug": "spinoff-air-tanks", "kind": "spinoff",
        "short": "Spinoff: Fireman’s Air Tanks",
        "title": "Fireman’s Air Tanks",
        "url": "https://spinoff.nasa.gov/node/9582",
        "description": "Basic information about the 1970s adaptation of spacesuit technology to improve firefighters’ air tanks and breathing gear.",
        "topic": "earth",
        "fetch": {"page": True, "ntrs": True},
        "stop_at": ["Related Stories"],
    },
    {
        "id": "RES-9", "slug": "spinoff-fire-detector", "kind": "spinoff",
        "short": "Spinoff: Fire Detector",
        "title": "Fire Detector",
        "url": "https://spinoff.nasa.gov/node/9407",
        "description": "Basic information about a 1970s smoke detector developed for the shuttle that, discriminating between smoke and dust, results in less nuisance alarms. As such, it has industrial applications (e.g., in mining operations).",
        "topic": "earth",
        "fetch": {"page": True, "ntrs": True},
        "stop_at": ["Related Stories"],
    },
    {
        "id": "RES-10", "slug": "spinoff-fire-attire", "kind": "spinoff",
        "short": "Spinoff: Fire Attire",
        "title": "New Technology for the Fire Attire",
        "url": "https://spinoff.nasa.gov/node/9918",
        "description": "Basic information about a 1980s application of NASA spacesuit technology to improve firefighter clothing.",
        "topic": "earth",
        "fetch": {"page": True, "ntrs": True},
        "stop_at": ["Related Stories"],
    },
]

KIND_NAME = {"data": "Data repository", "overview": "NASA web page", "video": "NASA video", "review": "NASA review",
             "history": "NASA lessons-learned page", "spinoff": "NASA Spinoff"}
