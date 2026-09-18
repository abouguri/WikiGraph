import pytest

from wikigraph.server import configured_port


def test_managed_host_port(monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    assert configured_port() == 8000
    monkeypatch.setenv("PORT", "10000")
    assert configured_port() == 10000


@pytest.mark.parametrize("value", ["", "abc", "0", "-1", "65536"])
def test_invalid_port_fails_explicitly(monkeypatch, value):
    monkeypatch.setenv("PORT", value)
    with pytest.raises(ValueError, match="PORT"):
        configured_port()
