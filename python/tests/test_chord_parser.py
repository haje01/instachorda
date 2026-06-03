"""tests/chord-parser.test.js 와 동일 케이스의 Python 포팅."""

from instachorda.chord_parser import ParsedChord, parse_chord


def test_단순_메이저_코드_파싱():
    assert parse_chord("C") == ParsedChord(root="C", quality="maj", modifier="", bass=None)


def test_마이너_코드_파싱():
    assert parse_chord("Am") == ParsedChord(root="A", quality="min", modifier="", bass=None)


def test_7th_코드_파싱():
    assert parse_chord("G7") == ParsedChord(root="G", quality="maj", modifier="7", bass=None)


def test_마이너_7th_코드_파싱():
    assert parse_chord("Am7") == ParsedChord(root="A", quality="min", modifier="7", bass=None)


def test_maj7_코드_파싱():
    assert parse_chord("Fmaj7") == ParsedChord(root="F", quality="maj", modifier="maj7", bass=None)


def test_sus4_코드_파싱():
    assert parse_chord("Dsus4") == ParsedChord(root="D", quality="maj", modifier="sus4", bass=None)


def test_샤프_루트_파싱():
    assert parse_chord("F#m") == ParsedChord(root="F#", quality="min", modifier="", bass=None)


def test_플랫_루트_파싱():
    assert parse_chord("Bb") == ParsedChord(root="Bb", quality="maj", modifier="", bass=None)


def test_디미니시드_파싱():
    assert parse_chord("Bdim") == ParsedChord(root="B", quality="dim", modifier="", bass=None)


def test_슬래시_코드_파싱():
    assert parse_chord("C/G") == ParsedChord(root="C", quality="maj", modifier="", bass="G")


def test_슬래시_수식어_파싱():
    assert parse_chord("Am7/G") == ParsedChord(root="A", quality="min", modifier="7", bass="G")


def test_공백_있는_입력_파싱():
    assert parse_chord(" C ") == ParsedChord(root="C", quality="maj", modifier="", bass=None)


def test_빈_문자열은_None():
    assert parse_chord("") is None


def test_파싱_불가는_None():
    assert parse_chord("Hello") is None


def test_유니코드_플랫_샾_정규화():
    assert parse_chord("B♭") == ParsedChord(root="Bb", quality="maj", modifier="", bass=None)
    assert parse_chord("F♯m") == ParsedChord(root="F#", quality="min", modifier="", bass=None)
    assert parse_chord("E♭maj7") == ParsedChord(root="Eb", quality="maj", modifier="maj7", bass=None)


def test_chordscore_위첨자_b_정규화():
    assert parse_chord("Bᵇ") == ParsedChord(root="Bb", quality="maj", modifier="", bass=None)
    assert parse_chord("BᵇM7") == ParsedChord(root="Bb", quality="maj", modifier="M7", bass=None)
    assert parse_chord("Eᵇm") == ParsedChord(root="Eb", quality="min", modifier="", bass=None)


def test_소문자_루트도_허용():
    assert parse_chord("c7") == ParsedChord(root="C", quality="maj", modifier="7", bass=None)
    assert parse_chord("a") == ParsedChord(root="A", quality="maj", modifier="", bass=None)
    assert parse_chord("f#m") == ParsedChord(root="F#", quality="min", modifier="", bass=None)
    assert parse_chord("c/g") == ParsedChord(root="C", quality="maj", modifier="", bass="G")


def test_괄호_텐션은_무시():
    assert parse_chord("C7(13)") == ParsedChord(root="C", quality="maj", modifier="7", bass=None)
    assert parse_chord("G7(b9)") == ParsedChord(root="G", quality="maj", modifier="7", bass=None)


def test_위첨자_캐럿_마커는_무시():
    assert parse_chord("C7^(13)") == ParsedChord(root="C", quality="maj", modifier="7", bass=None)


def test_on_베이스_표기를_슬래시_베이스로():
    assert parse_chord("DonE") == ParsedChord(root="D", quality="maj", modifier="", bass="E")
    assert parse_chord("AonC#") == ParsedChord(root="A", quality="maj", modifier="", bass="C#")
    assert parse_chord("Bm7onE") == ParsedChord(root="B", quality="min", modifier="7", bass="E")
