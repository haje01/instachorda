"""tests/kantan-converter.test.js 와 동일 케이스의 Python 포팅."""

from instachorda.kantan_converter import to_kantan


def test_C키_기본_다이어토닉():
    assert to_kantan("C", "C") == "1"
    assert to_kantan("Dm", "C") == "2"
    assert to_kantan("Em", "C") == "3"
    assert to_kantan("F", "C") == "4"
    assert to_kantan("G", "C") == "5"
    assert to_kantan("Am", "C") == "6"
    assert to_kantan("Bm", "C") == "7"


def test_C키_보너스_슬롯_8_9():
    assert to_kantan("Eb", "C") == "8"
    assert to_kantan("Bb", "C") == "9"


def test_수식어는_대괄호():
    assert to_kantan("G7", "C") == "5[7]"
    assert to_kantan("Am7", "C") == "6[7]"
    assert to_kantan("Fmaj7", "C") == "4[maj7]"
    assert to_kantan("Dsus4", "C") == "2[sus4]"


def test_슬래시_코드():
    assert to_kantan("C/G", "C") == "1/5"
    assert to_kantan("F/A", "C") == "4/6"


def test_마이너_스왑():
    assert to_kantan("Cm", "C") == "1~"
    assert to_kantan("Fm", "C") == "4~"


def test_마이너_스왑_수식어_결합():
    assert to_kantan("Dm7", "G") == "5~[7]"
    assert to_kantan("Cm7", "C") == "1~[7]"


def test_메이저가_마이너_슬롯에_매칭될_때_스왑():
    assert to_kantan("G#", "B") == "6~"
    assert to_kantan("G#7", "B") == "6~[7]"


def test_sus_는_스왑_불필요():
    assert to_kantan("Dsus4", "C") == "2[sus4]"
    assert to_kantan("Dsus2", "C") == "2[sus2]"


def test_dim_aug_수식어_흡수():
    assert to_kantan("Bdim", "C") == "7[dim]"


def test_크로매틱_시프트():
    assert to_kantan("Db", "G") == "5[b]"


def test_크로매틱_수식어_결합():
    assert to_kantan("Db7", "G") == "5[b7]"


def test_이명동음():
    assert to_kantan("Bb", "G") == "8"
    assert to_kantan("A#", "G") == "8"


def test_변환_불가():
    assert to_kantan("Zxy", "C") is None


def test_파싱_실패():
    assert to_kantan("Hello", "C") is None
    assert to_kantan("", "C") is None


def test_공백으로_두_코드가_붙으면_거부():
    assert to_kantan("Dm7 C", "G") is None


def test_알_수_없는_키():
    assert to_kantan("C", "Z") is None
