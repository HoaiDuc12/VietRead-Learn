(function (root) {
  'use strict';

  const VRL = (root.VRL = root.VRL || {});

  // Tier 1 (A1): ultra-basic function words & core elementary words
  const TIER_A1_LIST = (
    'a an the and or but if nor so yet for of in on at to from by with about into through during before after above below between out off over under again further then once here there when where why how all any both each few more most other some such no not only own same than too very can will just should could would may might must shall ' +
    'i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself it its itself they them their theirs themselves what which who whom whose this that these those ' +
    'am is are was were be been being have has had having do does did doing go goes went gone going get got gotten getting make makes made making take takes took taken taking come comes came coming see sees saw seen seeing know knows knew known knowing think thinks thought thinking look looks looked looking want wants wanted wanting give gives gave given giving use uses used using find finds found finding tell tells told telling ask asks asked asking work works worked working seem seems seemed seeming feel feels felt feeling try tries tried trying leave leaves left leaving call calls called calling ' +
    'good better best bad worse worst new old big small large little long short high low right left great early late young hard easy fast slow hot cold warm cool dark light true false full empty open close free real sure next last first second third many much lot lots well also even back still way down up away around near far off ' +
    'one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million billion zero half ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december ' +
    'time year people day man men woman women child children world life hand part place case week home house room school book car food water name word number line side head eye face door night morning today tomorrow yesterday friend family mother father brother sister son daughter baby boy girl dog cat sun moon tree city town road street money job desk table chair bed cup pen paper bag box key phone mail game play read write talk speak say said hear listen eat drink sleep walk run sit stand live love like hate need help keep let begin start stop end turn move show send bring buy pay meet set put hold live wait ' +
    'yes yeah okay ok hello hi hey bye please thanks thank sorry welcome maybe perhaps really almost already always never often sometimes usually soon later ago else ever still yet though although because since while until unless whether without within across along behind beside beyond inside outside toward towards upon'
  ).split(/\s+/);

  // Tier 2 (A2): very common everyday words (filtered out in Intermediate B1-B2 and Advanced C1+ modes)
  const TIER_A2_LIST = (
    'able ability accept access account across act action active activity actual actually add addition address admit adult affect afford afraid after afternoon age agency agent agree ahead air airline airport alive allow almost alone already also although always among amount analysis analyze animal announce another answer anyone anything anywhere appear apply approach area argue arm army around arrange arrive art article artist asian aside ask assume attack attempt attend attention attitude audience author available avoid award aware away ' +
    'background bag balance ball band bank bar base basic basis basket bath beach bear beat beautiful become bed bedroom before begin behavior behind believe bell belong below belt bench benefit beside best better between beyond bicycle big bike bill bird birth birthday bit bite black blame blank blind block blood blow blue board boat body bone bonus book boot border bore born borrow boss both bother bottle bottom bowl box boy brain branch brand bread break breakfast breath breathe brick bridge brief bright bring broad brother brown brush budget build building bullet bunch burn bus business busy butter button buy buyer ' +
    'cabinet cable cake calendar call calm camera camp campaign campus can cancel cancer candidate candle candy cap capable capacity capital captain capture car card care career careful carry case cash cast castle cat catch category cause ceiling celebrate cell center central century ceremony certain certainly chain chair chairman challenge chamber champion chance change channel chapter character charge charity chart chase cheap check cheek cheese chef chemical chest chicken chief child childhood chip chocolate choice choose church cigarette circle citizen city civil claim class classic classroom clean clear clearly clerk click client climate climb clock close closely clothes cloud club clue coach coal coast coat code coffee coin cold collapse collect collection college color column combination combine come comedy comfort comfortable command comment commercial commission commit committee common communicate community company compare comparison compete competition competitive complain complaint complete completely complex component computer concentrate concept concern concert conclude conclusion concrete condition conduct conference confidence confident confirm conflict confront confuse connect connection conscious consider consist consistent constant construct contact contain content contest context continue contract contrast contribute control conversation convert cook cookie cool copy core corn corner corporate correct cost cotton couch could council count counter country county couple courage course court cousin cover cow crack craft crash crazy cream create creation creative creature credit crew crime criminal crisis critic critical crop cross crowd crown crucial cruel crush cry cultural culture cup curious current currently curtain curve custom customer cut cycle ' +
    'dad daily damage dance danger dangerous dare dark darkness data database date daughter dawn day dead deal dealer dear death debate debt decade decide decision deck declare decline decorate decrease deep deeply deer defeat defend defense deficit define definitely definition degree delay deliver delivery demand democracy democratic demonstrate deny department depend dependent deposit depress depth describe description desert deserve design designer desire desk desperate despite destroy detail detect determine develop development device devote dialogue diamond diary die diet differ difference different difficult difficulty dig digital dimension dinner direct direction directly director dirt dirty disappear disaster discipline discover discovery discuss discussion disease dish disk dismiss display distance distant distinct distribute district disturb divide division divorce doctor document dog dollar domestic dominant dominate door double doubt down downtown dozen draft drag drama dramatic draw drawer drawing dream dress drink drive driver drop drug dry due dull dump during dust duty ' +
    'each eager ear early earn earth ease easily east eastern easy eat economic economics economy edge edition editor educate education educational effect effective effectively efficiency efficient effort egg eight either elbow elder elect election electric electricity electronic element elephant elevator eleven else elsewhere email embarrass emerge emergency emotion emotional emphasis emphasize employ employee employer employment empty enable encounter encourage end enemy energy enforce engage engine engineer engineering enhance enjoy enormous enough ensure enter enterprise entertain entire entirely entrance entry envelope environment environmental episode equal equally equipment era error escape especially essay essential establish estate estimate ethnic european evaluate even evening event eventually ever every everybody everyday everyone everything everywhere evidence evil evolution evolve exact exactly exam examine example exceed excellent except exception exchange excite excitement exciting exclude excuse execute exercise exhibit exist existence existing expand expect expectation expense expensive experience experiment expert explain explanation explode explore explosion export expose express expression extend extension extensive extent external extra extraordinary extreme extremely eye ' +
    'fabric face facility fact factor factory faculty fade fail failure fair fairly faith fall false familiar family famous fan fancy fantastic far farm farmer fashion fast fat fate father fault favor favorite fear feature federal fee feed feel feeling fellow female fence festival fetch fever few fiber fiction field fifteen fifth fifty fight fighter figure file fill film final finally finance financial find finding fine finger finish fire firm first fish fishing fit fitness five fix flag flame flash flat flavor flee flesh flight float flood floor flour flow flower fly focus fold folk follow following food foot football for force foreign forest forever forget forgive fork form formal format former formula forth fortune forty forward found foundation founder four fourth frame framework free freedom freeze french frequent frequently fresh friend friendly friendship frighten from front fruit frustrate fry fuel full fully fun function fund fundamental funeral funny fur furniture furthermore future ' +
    'gain galaxy gallery game gang gap garage garbage garden garlic gas gate gather gay gaze gear gender gene general generally generate generation generous gentle gentleman genuine geography get ghost giant gift girl girlfriend give glad glance glass global globe glove go goal goat god gold golden golf good goodbye goods govern government governor grab grace grade gradually graduate grain grand grandfather grandmother grant grape graph grasp grass grateful grave gray great greatest greatly green greet grey grid grief grill grin grind grip grocery ground group grow growth guarantee guard guess guest guide guideline guilt guilty guitar gun guy gym ' +
    'habit habitat hair half hall hammer hand handful handle hang happen happy harbor hard hardly hardware harm harmony hat hate have he head headline headquarters heal health healthy hear hearing heart heat heaven heavily heavy heel height helicopter hell hello helmet help helpful hence her herb here heritage hero herself hesitate hey hi hide high highlight highly highway hill him himself hint hip hire his historian historic historical history hit hold hole holiday holy home homeless honest honey honor hook hope horizon horror horse hospital host hot hotel hour house household housing how however huge human humor hundred hungry hunt hunter hurry hurt husband ' +
    'ice idea ideal identify identity ie if ignore ill illegal illness illustrate image imagination imagine immediate immediately immigrant impact implement implication imply import importance important impose impossible impress impression impressive improve improvement in incentive incident include including income incorporate increase increased increasing increasingly incredible indeed independence independent index indian indicate indication individual industrial industry infant infection inflation influence inform information ingredient initial initially initiative injure injury inner innocent input inquiry insect insert inside insight insist inspect inspire install instance instant instead instinct institution institutional instruction instructor instrument insurance intellectual intelligence intelligent intend intense intensity intention interaction interest interested interesting internal international internet interpret interpretation interval interview into introduce introduction invade invasion invent invest investigate investigation investment investor invite involve involved involvement iron island isolate issue it item its itself ' +
    'jacket jail jam japanese jar jaw jazz jeans jet jewel job join joint joke journal journalist journey joy judge judgment juice jump june junior jury just justice justify ' +
    'keep key keyboard kick kid kill killer killing kind king kingdom kiss kitchen knee knife knock know knowledge ' +
    'lab label labor laboratory lack ladder lady lake lamp land landscape lane language lap large largely laser last late later latest latin latter laugh launch law lawn lawsuit lawyer lay layer lazy lead leader leadership leading leaf league lean leap learn learning least leather leave lecture left leg legacy legal legend legislation legitimate lemon lend length less lesson let letter level liberal library license lid lie life lifestyle lifetime lift light like likely limit limitation limited line link lion lip liquid list listen literally literary literature little live living load loan local locate location lock log logic logical lonely long look loop loose lose loss lost lot loud love lovely lover low lower loyal luck lucky lunch lung luxury ' +
    'machine mad magazine magic mail main mainly maintain maintenance major majority make maker makeup male mall mama man manage management manager manner manufacturer manufacturing many map margin mark market marketing marriage married marry mask mass massive master match mate material math matter mature maximum may maybe mayor me meal mean meaning meanwhile measure measurement meat mechanism media medical medication medicine medium meet meeting melt member membership memory mental mention menu mere merely mess message metal meter method mexican middle midnight might military milk mill million mind mine mineral minimum minister minor minority minute miracle mirror miss missile mission mistake mix mixture mobile mode model moderate modern modest modify mom moment money monitor monkey month mood moon moral more moreover morning mortgage most mostly mother motion motivate motivation motor mount mountain mouse mouth move movement movie mr mrs ms much mud multiple murder muscle museum music musical musician must mutual my myself mystery myth ' +
    'naked name narrative narrow nation national native natural naturally nature near nearby nearly neat necessarily necessary neck need negative negotiate neighbor neighborhood neither nerve nervous net network neutral never nevertheless new newly news newspaper next nice night nine no nobody nod noise nomination none nonetheless noon nor normal normally north northern nose not note nothing notice notion novel now nowhere nuclear number numerous nurse nut ' +
    'oak object objective obligation observation observe observer obtain obvious obviously occasion occasional occasionally occupation occupy occur ocean odd odds of off offense offensive offer office officer official often oh oil ok okay old olympic on once one ongoing onion online only onto open opening operate operating operation operator opinion opponent opportunity oppose opposite opposition opt option or orange orbit order ordinary organ organic organization organize orientation origin original originally other others otherwise ought our ourselves out outcome outdoor outer outline output outside oven over overall overcome overlook owe own owner ' +
    'pace pack package page pain painful paint painter painting pair palace pale palm pan panel panic pant paper parade parent park parking part participant participate participation particular particularly partly partner partnership party pass passage passenger passion past pat patch path patient pattern pause pay payment pc peace peak peanut pear peasant peer pen penalty pencil people pepper per perceive percentage perception perfect perfectly perform performance perhaps period permanent permission permit person personal personality personally personnel perspective persuade pet phase phenomenon philosophy phone photo photograph photographer phrase physical physically physician piano pick picture pie piece pig pile pilot pine pink pipe pitch place plain plan plane planet planning plant plastic plate platform play player please pleasure plenty plot plus pm pocket poem poet poetry point pole police policy political politically politician politics poll pollution pond pool poor pop popular population porch port portion portrait portray pose position positive possess possibility possible possibly post pot potato potential potentially pound pour poverty powder power powerful practical practice praise pray prayer precisely predict prefer preference pregnancy pregnant preparation prepare prescription presence present presentation preserve president presidential press pressure pretend pretty prevent previous previously price pride priest primarily primary prime principal principle print prior priority prison prisoner privacy private probably problem procedure proceed process produce producer product production profession professional professor profile profit program progress project prominent promise promote prompt proof proper properly property proportion proposal propose proposed prosecutor prospect protect protection protein protest proud prove provide provider province provision psychological psychologist psychology pub public publication publicly publish pull pulse pump punch punish punishment purchase pure purpose pursue push put ' +
    'qualify quality quarter quarterback question quick quickly quiet quietly quit quite quote ' +
    'race racial radical radio rail rain raise range rank rapid rapidly rare rarely rate rather rating ratio raw reach react reaction read reader reading ready real reality realize really reason reasonable recall receive recent recently recipe recognition recognize recommend recommendation record recording recover recovery recruit red reduce reduction refer reference reflect reflection reform refrigerator refuse regard regarding regardless regime region regional register regular regularly regulate regulation reinforce reject relate relation relationship relative relatively relax release relevant relief religion religious rely remain remaining remarkable remember remind remote remove repeat repeatedly replace reply report reporter represent representation representative republican reputation request require requirement rescue research researcher resemble reservation resident resist resistance resolution resolve resort resource respect respond respondent response responsibility responsible rest restaurant restore restriction result retain retire retirement return reveal revenue reverse review revolution rhythm rice rich rid ride rifle right ring rise risk river road rock role roll romantic roof room root rope rose rough roughly round route routine row rub rubber ruin rule run running rural rush russian ' +
    'sacred sad safe safety sake salad salary sale sales salt same sample sanction sand sandwich satellite satisfaction satisfy sauce save saving say scale scandal scared scenario scene schedule scheme scholar scholarship school science scientific scientist scope score scream screen script sea search season seat second secret secretary section sector secure security see seed seek seem segment seize select selection self sell senate senator send senior sense sensitive sentence separate sequence series serious seriously servant serve service session set setting settle settlement seven several severe sex sexual shade shadow shake shall shape share sharp she sheet shelf shell shelter shift shine ship shirt shit shock shoe shoot shooting shop shopping shore short shortly shot should shoulder shout show shower shrug shut sick side sigh sight sign signal significance significant significantly silence silent silk silly silver similar similarly simple simply sin since sing singer single sink sir sister sit site situation six size ski skill skin sky slave sleep slice slide slight slightly slip slow slowly small smart smell smile smoke smooth snap snow so soap soccer social society sock sodium sofa soft software soil solar soldier sole solid solution solve some somebody somehow someone something sometimes somewhat somewhere son song soon sophisticated sorry sort soul sound soup source south southern soviet space spanish spare speak speaker special specialist species specific specifically speech speed spend spending spin spirit spiritual split spokesman sponsor sport spot spread spring square squeeze stability stable staff stage stair stake stand standard standing star stare start state statement station statistics status stay steady steak steal steam steel steep steer stem step stick still stimulate stir stock stomach stone stop storage store storm story straight strange stranger strategic strategy stream street strength strengthen stress stretch strike string strip stroke strong strongly structure struggle student studio study stuff stumble style subject submit subsequent substance substantial succeed success successful successfully such suck sudden suddenly sue suffer sufficient sugar suggest suggestion suicide suit summer summit sun super supply support supporter suppose supposed supreme sure surely surface surgery surprise surprised surprising surprisingly surround survey survival survive survivor suspect sustain swear sweep sweet swim swing switch symbol symptom system ' +
    'table tablespoon tactic tail take tale talent talk tall tank tap tape target task taste tax taxpayer tea teach teacher teaching team tear teaspoon technical technique technology teen teenager telephone telescope television tell temperature temporary ten tend tendency tennis tension tent term terms terrible territory terror terrorism terrorist test testify testimony testing text than thank thanks that the theater their them theme themselves then theory therapy there therefore these they thick thin thing think thinking third thirty this those though thought thousand threat threaten three throat through throughout throw thus ticket tie tight time tiny tip tire tired tissue title to tobacco today toe together tomato tomorrow tone tongue tonight too tool tooth top topic toss total totally touch tough tour tourist tournament toward towards tower town toy trace track trade tradition traditional traffic tragedy trail train training transfer transform transformation transition translate translation transmission transmit transport trap trash trauma travel tray treat treatment treaty tree tremendous trend trial tribe trick trip troop trouble truck true truly trust truth try tube tunnel turn tv twelve twenty twice twin two type typical typically ' +
    'ugly ultimate ultimately unable uncle under undergo understand understanding unfortunately uniform union unique unit united universal universe university unknown unless unlike likely unlikely until unusual up upon upper urban urge us use used useful user usual usually utility ' +
    'vacation valley valuable value variable variation variety various vary vast vegetable vehicle venture version versus very vessel veteran via victim victory video view viewer village violate violation violence violent virtually virtue virus visible vision visit visitor visual vital voice volume volunteer vote voter vs vulnerable ' +
    'wage wait wake walk wall wander want war warm warn warning wash waste watch water wave way we weak wealth wealthy weapon wear weather wedding week weekend weekly weigh weight welcome welfare well west western wet whale what whatever wheel when whenever where whereas wherever whether which while whisper white who whole whom whose why wide widely widespread wife wild will willing win wind window wine wing winner winter wipe wire wisdom wise wish with withdraw within without witness woman wonder wonderful wood wooden word work worker working works workshop world worried worry worth would wound wrap write writer writing wrong ' +
    'yard yeah year yell yellow yes yesterday yet yield you young your yours yourself youth zone'
  ).split(/\s+/);

  const TIER_A1_SET = new Set(TIER_A1_LIST.filter(Boolean));
  const TIER_A2_SET = new Set([...TIER_A1_LIST, ...TIER_A2_LIST].filter(Boolean));

  // Common English function words for quick local English text detection
  const EN_SIGNAL_WORDS = new Set([
    'the', 'and', 'that', 'with', 'for', 'from', 'this', 'have', 'are', 'was',
    'were', 'been', 'will', 'would', 'their', 'about', 'which', 'when', 'there',
    'what', 'your', 'more', 'can', 'not', 'but', 'into', 'they', 'has', 'had',
  ]);

  // Vietnamese diacritics regex (if significant Vietnamese diacritics exist, text is already Vietnamese)
  const VI_DIACRITIC_RE = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/gi;

  // Academic / rich morphology suffixes for scoring valuable vocabulary
  const RICH_SUFFIX_RE = /(tion|sion|ment|ness|ity|ous|ious|eous|ive|ative|able|ible|ence|ance|ize|ise|ify|logy|graphy|ship|ward|ful|less|ism|ist|ary|ory|ual|ial|ic|ical|acy|ate)$/i;
  const RICH_PREFIX_RE = /^(un|in|im|ir|il|dis|mis|re|pre|post|over|under|inter|intra|trans|sub|super|counter|multi|anti|co|auto|bio|geo|micro|macro|hyper|pseudo)/i;

  function getLemmaCandidates(word) {
    const w = String(word || '').toLowerCase();
    const set = new Set([w]);
    if (w.length <= 3) return set;

    // Plural / 3rd-person -s, -es, -ies
    if (w.endsWith('ies') && w.length > 4) {
      set.add(w.slice(0, -3) + 'y');
    }
    if (w.endsWith('ves') && w.length > 4) {
      set.add(w.slice(0, -3) + 'f');
      set.add(w.slice(0, -3) + 'fe');
    }
    if (w.endsWith('es') && w.length > 3) {
      set.add(w.slice(0, -2));
      set.add(w.slice(0, -1));
    }
    if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
      set.add(w.slice(0, -1));
    }

    // Past / participle -ed, -ied
    if (w.endsWith('ied') && w.length > 4) {
      set.add(w.slice(0, -3) + 'y');
    }
    if (w.endsWith('ed') && w.length > 4) {
      const stem = w.slice(0, -2);
      set.add(stem);
      set.add(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        set.add(stem.slice(0, -1)); // stopped -> stop
      }
    }

    // Gerund / present participle -ing
    if (w.endsWith('ing') && w.length > 5) {
      const stem = w.slice(0, -3);
      set.add(stem);
      set.add(stem + 'e'); // making -> make
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        set.add(stem.slice(0, -1)); // running -> run
      }
    }

    // Adverb -ly
    if (w.endsWith('ily') && w.length > 5) {
      set.add(w.slice(0, -3) + 'y');
    } else if (w.endsWith('ly') && w.length > 4) {
      set.add(w.slice(0, -2));
      set.add(w.slice(0, -2) + 'e');
    }

    // Comparatives / superlatives -er, -est
    if (w.endsWith('ier') && w.length > 4) {
      set.add(w.slice(0, -3) + 'y');
    } else if (w.endsWith('er') && w.length > 4) {
      const stem = w.slice(0, -2);
      set.add(stem);
      set.add(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        set.add(stem.slice(0, -1));
      }
    }
    if (w.endsWith('iest') && w.length > 5) {
      set.add(w.slice(0, -4) + 'y');
    } else if (w.endsWith('est') && w.length > 5) {
      const stem = w.slice(0, -3);
      set.add(stem);
      set.add(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        set.add(stem.slice(0, -1));
      }
    }

    return set;
  }

  function isCommonWord(word, level) {
    const w = String(word || '').toLowerCase();
    const candidates = getLemmaCandidates(w);
    const activeSet = level === 'beginner' ? TIER_A1_SET : TIER_A2_SET;

    for (const c of candidates) {
      if (activeSet.has(c)) return true;
    }

    // In advanced mode, filter shorter non-academic words too
    if (level === 'advanced' && w.length < 7 && !RICH_SUFFIX_RE.test(w)) {
      return true;
    }
    return false;
  }

  function isAlreadyVietnamese(text) {
    if (!text || text.length < 4) return false;
    const viMatches = text.match(VI_DIACRITIC_RE);
    const letters = text.match(/\p{L}/gu);
    if (!letters || letters.length === 0) return false;
    return (viMatches ? viMatches.length : 0) / letters.length >= 0.08;
  }

  function isLikelyEnglishText(text) {
    if (!text || text.length < 10) return false;
    if (isAlreadyVietnamese(text)) return false;

    const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
    const allLetters = (text.match(/\p{L}/gu) || []).length;
    if (allLetters === 0 || latinLetters / allLetters < 0.85) return false;

    const tokens = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    if (tokens.length < 2) return latinLetters >= 4;
    let enHits = 0;
    for (const t of tokens) {
      if (EN_SIGNAL_WORDS.has(t)) enHits++;
    }
    return enHits >= 1 || tokens.length >= 3;
  }

  function scoreWord(word, level) {
    let score = 0;
    const len = word.length;
    // Sweet spot length 6-13
    if (len >= 6 && len <= 13) score += 20 + (len - 5) * 2;
    else if (len >= 5) score += 12;
    else score += 5;

    if (RICH_SUFFIX_RE.test(word)) score += 14;
    if (RICH_PREFIX_RE.test(word)) score += 8;
    if (level === 'advanced' && len >= 8) score += 10;
    return score;
  }

  function extractLearningWords(text, options = {}) {
    if (!text || typeof text !== 'string') return [];

    const level = options.level || 'intermediate';
    const maxWords = Math.max(1, Number(options.maxWords) || 3);
    const knownSet = options.knownSet instanceof Set ? options.knownSet : new Set(options.knownWords || []);
    const savedSet = options.savedSet instanceof Set ? options.savedSet : new Set(options.savedWords || []);

    // Avoid URLs / emails / code tokens
    const cleaned = text.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ');
    const wordRe = /\b[A-Za-z]{4,22}\b/g;

    const seen = new Map();
    let match;
    while ((match = wordRe.exec(cleaned)) !== null) {
      const raw = match[0];
      const idx = match.index;
      const lower = raw.toLowerCase();

      // Skip ALL-CAPS acronyms (NASA, HTTP, API)
      if (raw === raw.toUpperCase() && raw.length >= 2) continue;

      // Skip CamelCase identifiers (e.g. getElementById)
      if (/[a-z][A-Z]/.test(raw)) continue;

      const isSaved = savedSet.has(lower);

      // Skip mid-sentence Capitalized proper nouns unless saved
      const prevSlice = cleaned.slice(Math.max(0, idx - 3), idx);
      const isSentenceStart = idx === 0 || /[.!?:\n"“'(]\s*$/.test(prevSlice);
      if (!isSaved && /^[A-Z][a-z]+$/.test(raw) && !isSentenceStart) {
        continue;
      }

      // Skip known words
      if (!isSaved && knownSet.has(lower)) continue;

      // Check lemma in knownSet as well
      const lemmas = getLemmaCandidates(lower);
      let lemmaKnown = false;
      for (const lm of lemmas) {
        if (knownSet.has(lm)) {
          lemmaKnown = true;
          break;
        }
      }
      if (!isSaved && lemmaKnown) continue;

      // Skip common words unless saved
      if (!isSaved && isCommonWord(lower, level)) continue;

      // Minimum length check
      const minLen = level === 'beginner' ? 4 : level === 'advanced' ? 6 : 5;
      if (!isSaved && lower.length < minLen) continue;

      const wordScore = isSaved ? 1000 + lower.length : scoreWord(lower, level);
      if (!seen.has(lower) || seen.get(lower).score < wordScore) {
        seen.set(lower, {
          word: lower,
          displayWord: lower,
          rawSurface: raw,
          score: wordScore,
          isSaved,
        });
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxWords);
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Plans mixed Vietnamese + English segments for Immersion mode
  // Returns { segments: [{type:'text', text} | {type:'mix', wordInfo, matchedVi}], unmatchedWords: [...] }
  function planImmersionSegments(vietnameseText, wordInfos) {
    if (!vietnameseText || !Array.isArray(wordInfos) || wordInfos.length === 0) {
      return {
        segments: [{ type: 'text', text: vietnameseText || '' }],
        unmatchedWords: wordInfos || [],
      };
    }

    // Build candidate Vietnamese phrases per English word
    const matches = [];
    const usedRanges = [];
    const matchedWordKeys = new Set();

    function overlaps(start, end) {
      return usedRanges.some((r) => !(end <= r.start || start >= r.end));
    }

    // Prioritize saved words first, then longer Vietnamese meanings (more specific matches)
    const prioritized = [...wordInfos].sort((a, b) => {
      if (a.isSaved !== b.isSaved) return a.isSaved ? -1 : 1;
      return (b.viMeaning || '').length - (a.viMeaning || '').length;
    });

    for (const info of prioritized) {
      const candidatePhrases = [];
      if (info.viMeaning) {
        // Split comma/semicolon variants too, e.g. "phổ biến, lan rộng"
        const parts = info.viMeaning.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
        candidatePhrases.push(info.viMeaning.trim(), ...parts);
      }
      if (Array.isArray(info.altMeanings)) {
        for (const alt of info.altMeanings) {
          if (alt && typeof alt === 'string') candidatePhrases.push(alt.trim());
        }
      }

      // Deduplicate & sort longest first, ignore overly tiny 1-2 char matches
      const uniqueCandidates = Array.from(new Set(candidatePhrases))
        .filter((p) => p.length >= 3)
        .sort((a, b) => b.length - a.length);

      let foundMatch = null;
      for (const phrase of uniqueCandidates) {
        // Unicode-aware word boundaries for Vietnamese letters
        const pattern = new RegExp(`(?<!\\p{L})${escapeRegex(phrase)}(?!\\p{L})`, 'iu');
        const m = pattern.exec(vietnameseText);
        if (m) {
          const start = m.index;
          const end = start + m[0].length;
          if (!overlaps(start, end)) {
            foundMatch = { start, end, matchedVi: m[0], wordInfo: info };
            break;
          }
        }
      }

      if (foundMatch) {
        usedRanges.push({ start: foundMatch.start, end: foundMatch.end });
        matches.push(foundMatch);
        matchedWordKeys.add(info.word);
      }
    }

    matches.sort((a, b) => a.start - b.start);

    const segments = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) {
        segments.push({ type: 'text', text: vietnameseText.slice(cursor, m.start) });
      }
      segments.push({
        type: 'mix',
        matchedVi: m.matchedVi,
        wordInfo: m.wordInfo,
      });
      cursor = m.end;
    }
    if (cursor < vietnameseText.length) {
      segments.push({ type: 'text', text: vietnameseText.slice(cursor) });
    }

    const unmatchedWords = wordInfos.filter((w) => !matchedWordKeys.has(w.word));
    return { segments, unmatchedWords };
  }

  VRL.vocabFilter = {
    getLemmaCandidates,
    isCommonWord,
    isAlreadyVietnamese,
    isLikelyEnglishText,
    extractLearningWords,
    planImmersionSegments,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRL.vocabFilter;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
