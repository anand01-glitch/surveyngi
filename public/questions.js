/*
 * Survey definition — single source of truth.
 * Loaded by the browser (survey form + admin dashboard) AND by server.js (validation, CSV export).
 *
 * type:  'single' | 'multi' | 'rating' | 'text'
 * multi questions carry `max` (the "select maximum N" rule from the paper form).
 * `short` is the compact label used on dashboard charts.
 */
(function (root) {
  var RATING_LABELS = [
    'Not Important',
    'Slightly Important',
    'Moderately Important',
    'Very Important',
    'Extremely Important'
  ];

  var single = function (id, text, options, short) {
    return { id: id, type: 'single', text: text, short: short || text, options: options, required: true };
  };
  var multi = function (id, text, max, options, short) {
    return { id: id, type: 'multi', text: text, short: short || text, max: max, options: options, required: true };
  };
  var rating = function (id, text, short) {
    return { id: id, type: 'rating', text: text, short: short, required: true };
  };
  var open = function (id, text, short) {
    return { id: id, type: 'text', text: text, short: short, required: false, maxLength: 1500 };
  };

  var sections = [
    {
      id: 'A',
      title: 'Student Profile',
      blurb: 'Tell us a little about where you are on your journey.',
      questions: [
        single(1, 'What is your current class/year?', ['+1', '+2', 'UG', 'PG'], 'Current class / year'),
        single(2, 'Which stream/programme are you currently studying?',
          ['Science', 'Commerce', 'Humanities', 'Computer Science', 'Other'], 'Current stream'),
        single(3, 'Which programme are you planning to pursue?',
          ['Engineering', 'Medicine', 'Pharmacy', 'Law', 'Architecture', 'Management', 'Arts & Science', 'Nursing', 'Other'],
          'Planned programme'),
        single(4, 'Where are you planning to study?', ['Kerala', 'Other State', 'Abroad', 'Undecided'], 'Planned study location')
      ]
    },
    {
      id: 'B',
      title: 'College Selection — What Drives the Decision?',
      blurb: 'Rate how much each factor matters when you choose a college.',
      questions: [
        rating(5, 'How important is the quality of teaching and faculty when selecting a college?', 'Teaching quality & faculty'),
        rating(6, 'How important are placement opportunities and expected career outcomes?', 'Placements & career outcomes'),
        rating(7, 'How important are internships and industry exposure?', 'Internships & industry exposure'),
        rating(8, 'How important are modern laboratories, classrooms and infrastructure?', 'Labs, classrooms & infrastructure'),
        rating(9, 'How important is the reputation/brand of the institution?', 'Institution reputation / brand'),
        rating(10, 'How important are fees and value for money?', 'Fees & value for money'),
        rating(11, 'How important are hostel and accommodation facilities?', 'Hostel & accommodation'),
        rating(12, 'How important is campus life, festivals, clubs and extracurricular activities?', 'Campus life & extracurriculars'),
        rating(13, 'How important are international exposure and overseas opportunities?', 'International exposure'),
        rating(14, 'How important is location and accessibility of the college?', 'Location & accessibility')
      ]
    },
    {
      id: 'C',
      title: 'What Does the Student Actually Want?',
      blurb: 'Your priorities, preferred way of learning, and the skills you hope to gain.',
      questions: [
        multi(15, 'Which FIVE factors would influence your final decision to join a college?', 5, [
          'Placement & salary opportunities', 'Academic quality', 'Faculty', 'Infrastructure', 'Industry exposure',
          'Internship opportunities', 'College reputation', 'Fees', 'Scholarships', 'Campus life', 'Sports', 'Hostel',
          'Cultural activities', 'International opportunities', 'Location', 'Safety', 'Peer group',
          'Parent recommendation', 'Social media/reviews'
        ], 'Final decision factors'),
        single(16, 'What type of learning experience would you prefer?', [
          'Mostly classroom/theory-based', 'Combination of theory and practical learning',
          'Mostly project-based/practical learning', 'Industry-integrated learning', 'Flexible/digital learning'
        ], 'Preferred learning experience'),
        multi(17, 'Which skills do you most expect to gain from college?', 5, [
          'Technical/professional skills', 'Communication', 'AI & technology', 'Coding/digital skills', 'Leadership',
          'Entrepreneurship', 'Problem solving', 'Teamwork', 'Foreign languages', 'Financial/business skills',
          'Presentation/public speaking'
        ], 'Skills expected from college'),
        rating(18, 'How important is AI and emerging technology in your college education?', 'AI & emerging technology'),
        single(19, 'What type of industry exposure would you value most?', [
          'Internships', 'Industrial visits', 'Live projects', 'Industry certifications', 'Guest lectures',
          'Industry mentors', 'Placement-linked training'
        ], 'Most valued industry exposure')
      ]
    },
    {
      id: 'D',
      title: 'Campus & Student Experience',
      blurb: 'The spaces and activities that make campus life worth living.',
      questions: [
        multi(20, 'Which FIVE campus facilities would most improve your college experience?', 5, [
          'Advanced laboratories', 'Library/digital library', 'Sports facilities', 'Gym', 'Cafeteria', 'Student lounge',
          'Gaming/e-sports', 'Innovation/incubation centre', 'Auditorium', 'Green/open spaces', 'Study/co-working spaces',
          'Wi-Fi/digital infrastructure'
        ], 'Campus facilities that matter'),
        multi(21, 'What are your expectations from hostel facilities?', 5, [
          'Good food', 'Wi-Fi', 'AC rooms', 'Attached bathroom', 'Cleanliness', 'Laundry', 'Recreation facilities',
          'Security', 'Study facilities', 'Medical support', 'Flexible food/menu choices'
        ], 'Hostel expectations'),
        rating(22, 'How important is an active campus life in your overall college experience?', 'Active campus life'),
        multi(23, 'Which activities would you most like your college to offer?', 5, [
          'Sports', 'Cultural festivals', 'Music & dance', 'Technical competitions', 'Entrepreneurship/start-up events',
          'Student clubs', 'Gaming/e-sports', 'International events', 'Social/community activities', 'Career events'
        ], 'Activities students want')
      ]
    },
    {
      id: 'E',
      title: 'Career & Future',
      blurb: 'Where you want to be once the degree is done.',
      questions: [
        single(24, 'What is your primary expectation after completing your programme?', [
          'Placement in India', 'Overseas employment', 'Higher studies in India', 'Higher studies abroad',
          'Government career', 'Entrepreneurship', 'Professional practice', 'Undecided'
        ], 'Primary post-programme expectation'),
        rating(25, "How important is a college's placement record when making your admission decision?", 'Placement record in admission'),
        multi(26, 'What would make you feel that your college has prepared you well for your career?', 3, [
          'Good placement', 'High-quality internship', 'Industry certification', 'Practical skills',
          'Professional networking', 'Entrepreneurship opportunity', 'International exposure',
          'Strong communication skills', 'Professional qualification', 'Successful alumni network'
        ], 'What signals career readiness')
      ]
    },
    {
      id: 'F',
      title: 'Management & Student Support',
      blurb: 'How the college can stand behind its students.',
      questions: [
        multi(27, 'Which student services should the college strengthen most?', 5, [
          'Career counselling', 'Placement support', 'Academic mentoring', 'Personal counselling', 'Higher-study guidance',
          'Overseas education support', 'Entrepreneurship support', 'Financial/scholarship support', 'Skill development',
          'Industry mentoring'
        ], 'Student services to strengthen'),
        rating(28, 'How important is it that students can easily communicate with faculty and college management?',
          'Easy access to faculty & management')
      ]
    },
    {
      id: 'G',
      title: 'Strategic Management Questions',
      blurb: 'Your honest words, in your own voice. These go straight to management.',
      questions: [
        open(29, 'If you could ask the college management to improve THREE things before you join, what would they be?',
          'Three improvements requested'),
        open(30, 'What would make you choose one college over another when both offer the same programme?',
          'What tips the choice')
      ]
    }
  ];

  var flat = [];
  var byId = {};
  sections.forEach(function (s) {
    s.questions.forEach(function (q) {
      q.section = s.id;
      flat.push(q);
      byId[q.id] = q;
    });
  });

  // Who is answering. Asked first, stored with the response (set required:false to make a field optional).
  var details = [
    { id: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, maxLength: 80,
      placeholder: 'e.g. Anjali Menon', autocomplete: 'name' },
    { id: 'email', label: 'Email address', type: 'email', required: true, maxLength: 120,
      placeholder: 'you@example.com', autocomplete: 'email' }
  ];

  var SURVEY = {
    title: 'Student Expectations & College Experience Survey',
    college: 'Jawaharlal College of Engineering and Technology',
    details: details,
    ratingLabels: RATING_LABELS,
    sections: sections,
    questions: flat,
    byId: byId
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SURVEY;
  else root.SURVEY = SURVEY;
})(typeof window !== 'undefined' ? window : this);
