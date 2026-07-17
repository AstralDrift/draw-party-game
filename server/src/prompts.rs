use crate::protocol::{DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID};

pub(crate) const SAFE_PROMPTS: &[&str] = &[
    "vampire dentist",
    "pizza lifeguard",
    "robot doing yoga",
    "haunted toaster",
    "wizard with stage fright",
    "moon on a first date",
    "cowboy accountant",
    "spaghetti tornado",
    "cat running a courtroom",
    "shark at a job interview",
    "grandma riding a comet",
    "turtle winning a marathon",
    "alien learning to skateboard",
    "snowman at the beach",
    "dragon selling insurance",
    "banana detective",
    "pirate in a library",
    "ghost taking a selfie",
    "octopus barista",
    "unicorn traffic cop",
    "angry refrigerator",
    "hamster business meeting",
    "skeleton birthday party",
    "penguin rock concert",
    "time traveler stuck in traffic",
    "ninja cooking pancakes",
    "giraffe in an elevator",
    "mermaid at a dentist",
    "monster babysitting",
    "wizard losing WiFi",
    "chair with stage dreams",
    "cloud walking a dog",
    "frog hosting a podcast",
    "mummy on vacation",
    "robot afraid of magnets",
    "potato superhero",
    "zombie ordering coffee",
    "castle with tiny legs",
    "fish driving a taxi",
    "bear at a tea party",
    "avocado running for mayor",
    "astronaut losing their keys",
    "cactus at a water park",
    "detective made of jelly",
    "sandwich giving a speech",
    "volcano taking a nap",
    "calendar with stage fright",
    "sock puppet news anchor",
    "mailbox joining a band",
    "pancake on a treasure hunt",
    "snail delivering pizza",
    "lamp training for a marathon",
    "toothbrush at a talent show",
    "spaceship stuck in a car wash",
    "cupcake lifting weights",
    "traffic cone at a fancy dinner",
    "backpack full of thunder",
    "submarine in a bathtub",
    "wizard opening a food truck",
    "moon wearing roller skates",
    "library book on vacation",
    "ice cream trying to hide",
    "robot learning ballet",
    "pillow solving a mystery",
    "rainbow in a board meeting",
    "pirate afraid of puddles",
    "sneaker running a bakery",
    "snow globe weather reporter",
    "accordion in outer space",
    "spoon winning a spelling bee",
    "hot dog at a chess match",
    "umbrella giving directions",
    "mountain learning karaoke",
    "pickle driving a race car",
    "kite stuck in an office",
    "waffle with a secret identity",
    "bubblegum building a rocket",
    "trophy going undercover",
    "pretzel teaching math class",
    "teapot at a dance contest",
    "broccoli bodyguard",
    "knight afraid of elevators",
    "yeti selling popsicles",
    "cowboy on a unicycle",
    "witch fixing a flat tire",
    "pharaoh at a grocery store",
    "viking assembling furniture",
    "genie stuck in a soda can",
    "centaur stuck in traffic",
    "troll collecting tolls politely",
    "fairy vacuuming the living room",
    "cyclops trying on sunglasses",
    "minotaur lost in a corn maze",
    "sphinx asking for directions",
    "golem watering houseplants",
    "kraken doing laundry",
    "sasquatch hitchhiking",
    "gargoyle watching a movie",
    "phoenix forgetting how to fly",
    "pirate map that lies",
    "treasure chest full of socks",
    "lantern afraid of moths",
    "cannon firing confetti",
    "balloon animal escape artist",
    "piñata hosting a reunion",
    "magician pulling a toaster",
    "juggler dropping planets",
    "tightrope walker carrying soup",
    "clown fixing a spaceship",
    "ringmaster training goldfish",
    "lobster fashion designer",
    "flamingo yoga instructor",
    "sloth racing a cheetah",
    "duck in a scuba suit",
    "panda learning to juggle",
    "bee running a lemonade stand",
    "seal balancing pancakes",
    "dolphin conducting an orchestra",
    "llama touring a museum",
    "hedgehog opening a spa",
];

pub(crate) const CHAOS_PROMPTS: &[&str] = &[
    "sentient traffic light judging your life choices",
    "raccoon CEO giving a TED talk",
    "haunted Roomba with revenge plans",
    "croissant that learned parkour",
    "wifi router hosting a talent show",
    "pickle jar running for class president",
    "goose in a tuxedo arguing with a mirror",
    "bluetooth speaker that only speaks in riddles",
    "toaster oven opening a jazz club",
    "rubber duck detective solving cereal crimes",
    "elevator that only stops at weird floors",
    "cactus influencer livestreaming a desert spa",
    "mime stuck inside a group chat",
    "lasagna plotting a soft coup",
    "umbrella that refuses to open on purpose",
    "sock that became a motivational speaker",
    "vending machine with trust issues",
    "paperclip building a tiny spaceship",
    "fridge magnet organizing a rebellion",
    "banana peel teaching defensive driving",
    "stapler with a secret double life",
    "parking cone running a luxury hotel",
    "dust bunny training for the Olympics",
    "keyboard missing only the useful keys",
    "coffee mug whispering spoilers",
    "charging cable that ghosted everyone",
    "plant that rates your interior design",
    "alarm clock that negotiates snoozes",
    "shopping cart escaping the supermarket",
    "glitter bomb applying for a quiet job",
    "doorbell interviewing strangers",
    "laundry basket filing a complaint",
    "remote control hiding from the couch",
    "spatula auditioning for a cooking show",
    "yogurt cup founding a startup",
    "garden gnome leading a heist",
    "bubble wrap popping for stress relief",
    "microwave timing a surprise party",
    "traffic jam that learned to dance",
    "lost sock opening a support group",
    "ceiling fan spinning conspiracy theories",
    "ice cube melting under pressure",
    "pencil eraser rewriting history",
    "sticky note stuck to destiny",
    "vacuum cleaner inhaling drama",
    "tea kettle screaming the weather",
    "puzzle piece looking for belonging",
    "flashlight afraid of the dark",
    "rubber band stretching the truth",
    "coin flip deciding dinner forever",
    "snow shovel dreaming of summer",
    "parking meter collecting secrets",
    "fire hydrant gossiping with dogs",
    "mailbox sorting emotional baggage",
    "doormat welcoming bad ideas",
    "coat hanger modeling haute couture",
    "toothbrush racing dental floss",
    "salt shaker seasoning a debate",
    "pepper mill grinding rumors",
    "napkin folding origami excuses",
    "straw sipping through a crisis",
    "plastic fork hosting fine dining",
    "paper bag reinventing itself",
    "tape dispenser sticking to principles",
    "scissors cutting awkward silences",
    "glue stick bonding strangers",
    "ruler measuring peer pressure",
    "compass pointing toward snacks",
    "thermometer judging the vibe",
    "hourglass running late again",
    "calendar flipping out midweek",
    "bubble wand casting party spells",
    "hula hoop orbiting a boardroom",
    "yo-yo negotiating ups and downs",
    "frisbee delivering office memos",
    "beach ball bouncing through customs",
    "trampoline launching apologies",
    "scooter commuting through a museum",
    "skateboard filing expense reports",
    "roller skate auditioning for ballet",
    "unicycle balancing the budget",
    "kayak paddling through a cubicle",
    "surfboard catching WiFi waves",
    "snowboard shredding a spreadsheet",
    "parachute landing in a meeting",
    "telescope spying on leftovers",
    "microscope magnifying tiny problems",
    "binoculars watching the microwave",
    "megaphone whispering politely",
    "harmonica interrupting elevator music",
    "kazoo leading a serious meeting",
    "tambourine announcing lunch break",
    "maraca shaking up the agenda",
    "xylophone spelling out deadlines",
    "bagpipe negotiating quiet hours",
    "tuba stuck in a revolving door",
    "accordion squeezing into small talk",
    "banjo picking fights with silence",
    "ukulele serenading a vending machine",
    "drumstick conducting kitchen chaos",
    "cymbal crashing a book club",
    "trumpet waking the neighborhood politely",
    "flute whistling while working remotely",
    "violin crying over spilled soup",
    "piano practicing elevator pitches",
    "guitar string snapping under deadlines",
    "amp turning whispers into announcements",
    "DJ booth mixing grocery lists",
    "karaoke machine forgetting the lyrics",
    "disco ball reflecting poor decisions",
    "whiteboard erasing evidence",
];

struct PromptPack {
    id: &'static str,
    prompts: &'static [&'static str],
}

const PROMPT_PACKS: &[PromptPack] = &[
    PromptPack {
        id: DEFAULT_PROMPT_PACK_ID,
        prompts: SAFE_PROMPTS,
    },
    PromptPack {
        id: PARTY_CHAOS_PROMPT_PACK_ID,
        prompts: CHAOS_PROMPTS,
    },
];

pub(crate) fn prompt_pack_prompts(prompt_pack_id: &str) -> Option<&'static [&'static str]> {
    PROMPT_PACKS
        .iter()
        .find(|pack| pack.id == prompt_pack_id)
        .map(|pack| pack.prompts)
}

#[cfg(test)]
mod tests {
    use super::{prompt_pack_prompts, CHAOS_PROMPTS, PROMPT_PACKS, SAFE_PROMPTS};
    use crate::protocol::{DEFAULT_PROMPT_PACK_ID, PARTY_CHAOS_PROMPT_PACK_ID};
    use std::collections::HashSet;

    const MIN_PROMPTS_PER_PACK: usize = 100;

    fn assert_pack_quality(id: &str, prompts: &[&str]) {
        assert!(!prompts.is_empty(), "prompt pack {id} must be non-empty");
        assert!(
            prompts.len() >= MIN_PROMPTS_PER_PACK,
            "prompt pack {id} has {} prompts; expected at least {MIN_PROMPTS_PER_PACK}",
            prompts.len()
        );

        let mut seen = HashSet::new();
        for prompt in prompts {
            let normalized = prompt.trim().to_ascii_lowercase();
            assert!(
                !normalized.is_empty(),
                "prompt pack {id} contains an empty prompt"
            );
            assert!(
                seen.insert(normalized),
                "prompt pack {id} has duplicate prompt: {prompt}"
            );
        }
    }

    #[test]
    fn prompt_packs_are_non_empty_unique_and_meet_minimum_count() {
        assert_eq!(PROMPT_PACKS.len(), 2);
        assert_pack_quality(DEFAULT_PROMPT_PACK_ID, SAFE_PROMPTS);
        assert_pack_quality(PARTY_CHAOS_PROMPT_PACK_ID, CHAOS_PROMPTS);

        assert_eq!(
            prompt_pack_prompts(DEFAULT_PROMPT_PACK_ID),
            Some(SAFE_PROMPTS)
        );
        assert_eq!(
            prompt_pack_prompts(PARTY_CHAOS_PROMPT_PACK_ID),
            Some(CHAOS_PROMPTS)
        );
        assert!(prompt_pack_prompts("unknown").is_none());
    }
}
