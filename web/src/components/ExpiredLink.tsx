'use client';

interface ExpiredLinkProps {
  message: string;
}

export default function ExpiredLink({ message }: ExpiredLinkProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          アクセスできません
        </h1>
        <p className="text-gray-500 leading-relaxed">
          {message}
        </p>
        <p className="text-sm text-gray-400 mt-6">
          お心当たりがある場合は、写真を共有した方にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
