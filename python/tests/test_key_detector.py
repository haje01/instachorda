"""tests/key-detector.test.js 와 동일 케이스의 Python 포팅."""

from instachorda.key_detector import detect_key


def test_전형적인_C키_진행():
    assert detect_key(["C", "G", "Am", "F"]) == "C"


def test_C키_확장_진행():
    assert detect_key(["C", "Am", "F", "G", "C", "Em", "Dm", "G7"]) == "C"


def test_G키_진행():
    assert detect_key(["G", "D", "Em", "C"]) == "G"


def test_빈_입력은_None():
    assert detect_key([]) is None


def test_파싱_불가만_있으면_None():
    assert detect_key(["Hello", "World"]) is None


def test_수식어_있는_코드도_카운트():
    assert detect_key(["C", "G7", "Am7", "Fmaj7"]) == "C"


def test_샤프_키_감지():
    assert detect_key(["F#", "C#", "D#m", "B"]) == "F#"


def test_A키_감지():
    assert detect_key(["A", "E", "F#m", "D"]) == "A"


def test_스왑_최소화_선호():
    # Dm, Am, Gm 모두 슬롯 그대로인 키는 F
    assert detect_key(["Dm", "Am", "Gm"]) == "F"


def test_크로매틱_적은_키_선호():
    assert detect_key(["G", "D", "Em", "C", "F"]) == "G"


def test_세컨더리_도미넌트가_많아도_토닉_중심_키_선호():
    # A 장조 곡 (涙はどこへいったの 스타일): 세컨더리 도미넌트 F#, B, C#7 다수.
    # 마커 수만 보면 B 키가 유리하지만 (F#→5, B→1, A→9 보너스 슬롯),
    # 토닉 A 를 보너스 슬롯 9 에 두는 것은 부자연스러움.
    # 보너스 슬롯(8/9) 사용 패널티로 A 키가 선택되어야 함.
    chords = [
        "A", "Asus4", "A", "Asus4", "F#", "B", "F#", "B", "D", "E",
        "A", "AM7", "A6", "F#7sus4", "F#7", "Bm", "BmM7", "Bm7", "E7",
        "A", "C#aug7", "C#7", "F#m7", "F#7sus4", "F#7",
        "Bm7", "C#m7", "D", "E", "A", "Asus4", "Asus4", "A",
    ]
    assert detect_key(chords) == "A"
