import { BRIDGE_VERSION, parseInboundMessage } from './protocol';

/**
 * web から届くメッセージの検証。
 *
 * ここは信頼境界である。web は即時デプロイされ、アプリの更新は
 * ストア審査を挟んで数日〜数週間遅れる。したがって
 * **古いアプリが新しい web のメッセージを受け取る状況が常に起こりうる。**
 */

const NONCE = 'nonce-abc';

const msg = (overrides: Record<string, unknown>) =>
  JSON.stringify({ v: BRIDGE_VERSION, nonce: NONCE, ...overrides });

describe('parseInboundMessage', () => {
  it('不正な JSON を無視する', () => {
    expect(parseInboundMessage('{', NONCE)).toBeNull();
    expect(parseInboundMessage('null', NONCE)).toBeNull();
    expect(parseInboundMessage('"文字列"', NONCE)).toBeNull();
  });

  it('nonce が一致しないメッセージを捨てる', () => {
    expect(parseInboundMessage(msg({ type: 'openSettings' }), 'other')).toBeNull();
  });

  // Android では注入が遅れ、web が nonce を知らないまま送ることがある。
  // それを受け入れると、ページ内の任意のスクリプトが nonce 無しで
  // ネイティブを操作できることになる。
  it('nonce が無いメッセージを捨てる', () => {
    const raw = JSON.stringify({ v: BRIDGE_VERSION, type: 'openSettings' });
    expect(parseInboundMessage(raw, NONCE)).toBeNull();
  });

  it('バージョンが違うメッセージを捨てる', () => {
    const raw = JSON.stringify({ v: BRIDGE_VERSION + 1, nonce: NONCE, type: 'openSettings' });
    expect(parseInboundMessage(raw, NONCE)).toBeNull();
  });

  /**
   * これが後方互換の要である。
   *
   * 受信 type を増やすときに BRIDGE_VERSION を上げてはいけない。
   * 上げると新しい web と古いアプリの間で**全メッセージ**が
   * バージョン不一致で死ぬ。未知の type を無視できるからこそ、
   * バージョンを据え置いたまま追加できる。
   */
  it('未知の type を無視する（例外を投げない）', () => {
    expect(parseInboundMessage(msg({ type: 'futureFeature' }), NONCE)).toBeNull();
    expect(() => parseInboundMessage(msg({ type: 'futureFeature' }), NONCE)).not.toThrow();
  });

  describe('invitationInvalid', () => {
    it('token を伴うものを受け付ける', () => {
      const parsed = parseInboundMessage(
        msg({ type: 'invitationInvalid', token: 'tok-123' }),
        NONCE
      );
      expect(parsed).toMatchObject({ type: 'invitationInvalid', token: 'tok-123' });
    });

    // token が無いと、どの招待に対する通知か特定できない。
    // 特定できないまま破棄すると、無関係な有効トークンを消しうる。
    it('token が無いものを捨てる', () => {
      expect(parseInboundMessage(msg({ type: 'invitationInvalid' }), NONCE)).toBeNull();
      expect(
        parseInboundMessage(msg({ type: 'invitationInvalid', token: '' }), NONCE)
      ).toBeNull();
      expect(
        parseInboundMessage(msg({ type: 'invitationInvalid', token: 123 }), NONCE)
      ).toBeNull();
    });
  });

  describe('既存のメッセージ（回帰）', () => {
    it('saveImage を受け付ける', () => {
      const parsed = parseInboundMessage(
        msg({ type: 'saveImage', requestId: 'r1', token: 't', imageId: 'i' }),
        NONCE
      );
      expect(parsed).toMatchObject({ type: 'saveImage', imageId: 'i' });
    });

    it('saveImages を受け付ける', () => {
      const parsed = parseInboundMessage(
        msg({ type: 'saveImages', requestId: 'r1', token: 't', imageIds: ['a', 'b'] }),
        NONCE
      );
      expect(parsed).toMatchObject({ type: 'saveImages', imageIds: ['a', 'b'] });
    });

    it('imageIds に文字列以外が混ざるものを捨てる', () => {
      const raw = msg({ type: 'saveImages', requestId: 'r1', token: 't', imageIds: ['a', 1] });
      expect(parseInboundMessage(raw, NONCE)).toBeNull();
    });

    it('cancelSave と openSettings を受け付ける', () => {
      expect(parseInboundMessage(msg({ type: 'cancelSave', requestId: 'r1' }), NONCE))
        .toMatchObject({ type: 'cancelSave' });
      expect(parseInboundMessage(msg({ type: 'openSettings' }), NONCE))
        .toMatchObject({ type: 'openSettings' });
    });
  });
});
