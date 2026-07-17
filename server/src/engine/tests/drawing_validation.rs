use super::helpers::*;
use super::super::*;

#[test]
fn rejects_empty_drawing() {
    let mut room = room_with_players();
    room.handle_start_or_advance(100).unwrap();
    let err = room
        .submit_drawing("p1", room.turn_token, empty_drawing(), 200)
        .unwrap_err();
    assert_eq!(err.code, "blank_drawing");
}

#[test]
fn sanitize_name_and_guess_boundaries() {
    assert_eq!(sanitize_name("   "), "Player");
    assert_eq!(sanitize_name(""), "Player");
    assert_eq!(sanitize_name("  Ada  "), "Ada");
    let long = "A".repeat(MAX_NAME_LEN + 10);
    assert_eq!(sanitize_name(&long).chars().count(), MAX_NAME_LEN);
    let unicode = "😀".repeat(MAX_NAME_LEN + 2);
    assert_eq!(sanitize_name(&unicode).chars().count(), MAX_NAME_LEN);

    assert_eq!(sanitize_guess("   ").unwrap_err().code, "empty_guess");
    assert_eq!(sanitize_guess("").unwrap_err().code, "empty_guess");
    let long_guess = "x".repeat(MAX_GUESS_LEN + 20);
    assert_eq!(
        sanitize_guess(&long_guess).unwrap().chars().count(),
        MAX_GUESS_LEN
    );
}

#[test]
fn validate_drawing_rejects_malformed_payloads_and_accepts_limits() {
    let two = vec![Point { x: 1, y: 1 }, Point { x: 2, y: 2 }];
    let rejects: Vec<(DrawingDoc, &str)> = vec![
        (
            DrawingDoc {
                width: CANVAS_WIDTH - 1,
                height: CANVAS_HEIGHT,
                strokes: drawing().strokes,
            },
            "invalid_drawing_size",
        ),
        (empty_drawing(), "blank_drawing"),
        (
            drawing_with_strokes(
                (0..=MAX_STROKES)
                    .map(|_| stroke_with_points(two.clone(), "#111111", 6))
                    .collect(),
            ),
            "drawing_too_large",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(
                (0..=MAX_POINTS_PER_STROKE)
                    .map(|i| Point {
                        x: (i as u16) % CANVAS_WIDTH,
                        y: 1,
                    })
                    .collect(),
                "#111111",
                6,
            )]),
            "stroke_too_large",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(
                vec![Point { x: 1, y: 1 }],
                "#111111",
                6,
            )]),
            "stroke_too_short",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(two.clone(), "#111111", 0)]),
            "invalid_brush",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(two.clone(), "#111111", 33)]),
            "invalid_brush",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(two.clone(), "#GGG000", 6)]),
            "invalid_color",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(two.clone(), "#11223344", 6)]),
            "invalid_color",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(two.clone(), "111111", 6)]),
            "invalid_color",
        ),
        (
            drawing_with_strokes(vec![stroke_with_points(
                vec![
                    Point {
                        x: CANVAS_WIDTH + 1,
                        y: 1,
                    },
                    Point { x: 2, y: 2 },
                ],
                "#111111",
                6,
            )]),
            "point_out_of_bounds",
        ),
    ];
    for (doc, code) in rejects {
        assert_eq!(validate_drawing(&doc).unwrap_err().code, code);
    }

    let accepts = [
        drawing_with_strokes(
            (0..MAX_STROKES)
                .map(|_| stroke_with_points(two.clone(), "#abcdef", 1))
                .collect(),
        ),
        drawing_with_strokes(vec![stroke_with_points(
            (0..MAX_POINTS_PER_STROKE)
                .map(|i| Point {
                    x: (i as u16) % CANVAS_WIDTH,
                    y: 1,
                })
                .collect(),
            "#111111",
            32,
        )]),
        drawing_with_strokes(vec![stroke_with_points(
            vec![
                Point {
                    x: CANVAS_WIDTH,
                    y: CANVAS_HEIGHT,
                },
                Point { x: 0, y: 0 },
            ],
            "#ABCDEF",
            6,
        )]),
    ];
    for doc in accepts {
        validate_drawing(&doc).unwrap();
    }
}
