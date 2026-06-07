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


def test_sus4_는_스왑_불필요_sus2_는_미지원_트라이어드():
    assert to_kantan("Dsus4", "C") == "2[sus4]"
    # sus2 는 Instachord 미지원이라 트라이어드로 축약 → maj/min 스왑 적용
    assert to_kantan("Dsus2", "C") == "2~"


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


def test_ultimate_guitar_실측_코드명():
    # UG 는 슬래시 베이스를 한 토큰으로 제공 (결합 로직 없이 변환)
    assert to_kantan("C/B", "C") == "1/7"
    assert to_kantan("Am/G", "C") == "6/5"
    assert to_kantan("F/E", "C") == "4/3"
    assert to_kantan("Dm/C", "C") == "2/1"
    assert to_kantan("G/F", "C") == "5/4"
    assert to_kantan("Em/D", "C") == "3/2"
    # 텐션/수식어가 붙은 UG 코드명 (간략화 적용: 6add11 → 6)
    assert to_kantan("G6", "C") == "5[6]"
    assert to_kantan("G7", "C") == "5[7]"
    assert to_kantan("G6add11", "C") == "5[6]"


def test_instachord_연주용_간략화():
    # m7b5(하프디미니시드)는 m7 로 (b5 만 버리고 단3도+단7도 보존, 실연주 시 더 어울림)
    assert to_kantan("D#m7b5", "E") == "7[7]"  # E키 슬롯7 = D#m → 7[7]
    assert to_kantan("D#m7b5", "A") == "5~[b7]"
    assert to_kantan("Bm7b5", "A") == "2[7]"
    assert to_kantan("Am7b5", "A") == "1~[7]"
    # 7 없는 드문 mb5 표기는 dim 트라이어드로
    assert to_kantan("Cmb5", "C") == "1[dim]"
    # 확장/알터레이션 도미넌트는 7 로, 단독 9 는 9 유지
    assert to_kantan("E13", "A") == "5[7]"
    assert to_kantan("E7b9", "A") == "5[7]"
    assert to_kantan("E11", "A") == "5[7]"
    assert to_kantan("E9", "A") == "5[9]"
    # maj 계열은 maj7 로
    assert to_kantan("Emaj9", "A") == "5[maj7]"
    assert to_kantan("Emaj7", "A") == "5[maj7]"
    # 6 / sus4 는 유지, sus2 / add9 는 트라이어드로
    assert to_kantan("D6", "A") == "4[6]"
    assert to_kantan("Dsus4", "A") == "4[sus4]"
    assert to_kantan("Dsus2", "A") == "4"
    assert to_kantan("Dadd9", "A") == "4"
    # dim/aug 는 지원 퀄리티 — 붙은 수식어만 제거
    assert to_kantan("Cdim7", "A") == "8[dim]"
    assert to_kantan("Caug", "A") == "8[aug]"
    # 지원 범위 안의 코드는 그대로 통과
    assert to_kantan("E7", "A") == "5[7]"
    assert to_kantan("Am7", "A") == "1~[7]"
    assert to_kantan("D#7", "A") == "5[b7]"
