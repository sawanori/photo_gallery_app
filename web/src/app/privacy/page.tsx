import type { Metadata } from 'next';

/**
 * プライバシーポリシー。
 *
 * App Store Connect は公開到達可能なプライバシーポリシー URL を必須で要求する。
 * このサイトで**唯一の一般公開ページ**であり、招待トークンで守られていない。
 *
 * サイト全体は layout.tsx で noindex にしてあるが、このページだけは索引を許す。
 * 法的な告知文であり、隠す理由がない。ギャラリー本体とは性質が違う。
 *
 * 記載内容はコードの実態に合わせてある。変更したら**両方**を直すこと:
 * - 匿名認証: web/src/services/sessionService.ts
 * - お気に入り: firestore.rules の likes
 * - 写真の保存: mobile/src/save/（書き込み専用。読み取り権限は宣言しない）
 * - 解析ツールは一切入れていない（web / mobile とも依存に無い）
 */
export const metadata: Metadata = {
  title: 'プライバシーポリシー | NonTurnPhoto',
  description: 'NonTurnPhoto のプライバシーポリシー',
  robots: { index: true, follow: true },
};

const UPDATED = '2026年8月22日';
const CONTACT_EMAIL = 'info@non-turn.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-neutral-700">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-800">
      <h1 className="text-2xl font-medium text-neutral-900">プライバシーポリシー</h1>
      <p className="mt-2 text-sm text-neutral-500">最終更新日: {UPDATED}</p>

      <p className="mt-8 text-[15px] leading-7 text-neutral-700">
        NonTurn合同会社（以下「当社」）は、写真納品サービス「Photo Gallery」（ウェブサイトおよび
        iOS / Android アプリ。以下「本サービス」）における個人情報の取り扱いについて、
        以下のとおり定めます。
      </p>

      <Section title="1. 取得する情報">
        <p>本サービスは、閲覧者の氏名・メールアドレス・電話番号を取得しません。アカウント登録もありません。</p>
        <p>本サービスの利用にあたり、次の情報を取得します。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-neutral-900">匿名の識別子</strong>
            ：閲覧を継続するために、氏名等と結び付かない匿名の識別子を自動的に発行します。
            個人を特定するものではありません。
          </li>
          <li>
            <strong className="font-medium text-neutral-900">招待トークン</strong>
            ：お渡ししたリンクに含まれる文字列です。どのギャラリーを表示するかの判定に使います。
          </li>
          <li>
            <strong className="font-medium text-neutral-900">お気に入りの選択内容</strong>
            ：選んでいただいた写真の識別子を保存します。撮影担当者が選定結果を確認するために使います。
          </li>
          <li>
            <strong className="font-medium text-neutral-900">アクセス日時・アクセス回数</strong>
            ：ギャラリーが開かれた日時と回数を記録します。
          </li>
          <li>
            <strong className="font-medium text-neutral-900">サーバーのアクセスログ</strong>
            ：ホスティング事業者が自動的に記録する IP アドレス、ブラウザの種類等です。
            障害対応と不正アクセスの検知に使います。
          </li>
        </ul>
      </Section>

      <Section title="2. 取得しない情報">
        <ul className="list-disc space-y-2 pl-5">
          <li>位置情報</li>
          <li>連絡先、カレンダー、マイク、カメラの情報</li>
          <li>端末の写真ライブラリの中身（下記3をご覧ください）</li>
          <li>広告識別子。本サービスは広告を配信せず、行動履歴の追跡も行いません</li>
        </ul>
        <p>
          本サービスには、アクセス解析ツールや広告計測ツールを一切組み込んでいません。
        </p>
      </Section>

      <Section title="3. アプリの写真へのアクセスについて">
        <p>
          アプリは、選んだ写真を端末の写真アプリに保存するために
          <strong className="font-medium text-neutral-900">「写真の追加」の権限のみ</strong>
          を求めます。
        </p>
        <p>
          <strong className="font-medium text-neutral-900">
            端末に既に保存されている写真を読み取る権限は要求しません。
          </strong>
          アプリは利用者の写真ライブラリの中身を閲覧できず、当社がその内容を取得することもありません。
          保存した写真は端末内にのみ残ります。
        </p>
      </Section>

      <Section title="4. 利用目的">
        <ul className="list-disc space-y-2 pl-5">
          <li>撮影した写真を、依頼者ご本人および共有先の方へお届けするため</li>
          <li>お気に入りの選定結果を撮影担当者が確認するため</li>
          <li>不正なアクセスの検知および障害対応のため</li>
        </ul>
        <p>上記以外の目的には利用しません。</p>
      </Section>

      <Section title="5. 第三者提供・委託">
        <p>取得した情報を第三者に販売・提供することはありません。</p>
        <p>本サービスの運営のため、以下の事業者のサービスを利用しています。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Google LLC（Firebase Authentication / Cloud Firestore / Cloud Storage）
            — 写真および上記1の情報の保管。データの保存先リージョンは東京（asia-northeast1）です。
          </li>
          <li>Vercel Inc.（ウェブサイトのホスティング）— アクセスログの記録。</li>
        </ul>
      </Section>

      <Section title="6. 保存期間">
        <p>
          写真および関連する情報は、納品後おおむね20日を目安に当社が削除します。
          個別の案件で期間の定めがある場合は、その定めによります。
        </p>
        <p>
          招待リンクには閲覧期限があり、期限を過ぎるとギャラリーを開けなくなります。
        </p>
      </Section>

      <Section title="7. 安全管理">
        <p>
          ギャラリーは、お渡しした招待リンクを知っている方のみが開けます。
          通信はすべて暗号化（HTTPS）しています。
          リンクの取り扱いにはご注意ください。第三者に転送されると、その方もギャラリーを開けます。
        </p>
      </Section>

      <Section title="8. 開示・削除のご請求">
        <p>
          ご自身に関する情報の開示、訂正、削除をご希望の場合は、下記までご連絡ください。
          ご本人であることを確認のうえ、速やかに対応します。
        </p>
      </Section>

      <Section title="9. 本ポリシーの変更">
        <p>
          内容を変更する場合は、本ページに変更後の内容と最終更新日を掲示します。
        </p>
      </Section>

      <Section title="10. お問い合わせ">
        <p>
          NonTurn合同会社
          <br />
          メール:{' '}
          <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          <br />
          ウェブサイト:{' '}
          <a
            className="underline underline-offset-2"
            href="https://non-turn.com/"
            target="_blank"
            rel="noreferrer"
          >
            https://non-turn.com/
          </a>
        </p>
      </Section>

      <hr className="mt-14 border-neutral-200" />

      <h2 className="mt-10 text-lg font-medium text-neutral-900">Privacy Policy (English)</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-neutral-700">
        <p>
          NonTurn LLC operates Photo Gallery, a private photo delivery service. This is a summary of
          the Japanese policy above, which prevails in case of any discrepancy.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">What we collect.</strong> We do not ask
          viewers for a name, email address, or phone number, and there is no account registration.
          We generate an anonymous identifier so a viewing session can continue, and we store the
          invitation token from your link, the photos you mark as favourites, access timestamps and
          counts, and standard server access logs (IP address, browser type).
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Photos on your device.</strong> The app
          requests permission to <em>add</em> photos to your photo library only. It never requests
          permission to read your existing photos, cannot see your library, and we never receive its
          contents. Saved photos stay on your device.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">What we do not collect.</strong> No
          location data, no contacts, calendar, microphone or camera data, and no advertising
          identifiers. The service contains no analytics or ad-measurement tools of any kind, and we
          do not track you across apps or websites.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Sharing.</strong> We never sell or share
          your data with third parties. We use Google Firebase (authentication, database, storage;
          data stored in the Tokyo region) and Vercel (website hosting) to operate the service.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Retention.</strong> Photos and related
          data are deleted approximately 20 days after delivery, unless otherwise agreed. Invitation
          links expire and stop working after their viewing period ends.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Your rights.</strong> To request access
          to, correction of, or deletion of your data, contact{' '}
          <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p className="text-sm text-neutral-500">Last updated: 22 August 2026</p>
      </div>
    </main>
  );
}
