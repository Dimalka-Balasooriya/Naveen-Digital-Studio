import { Copyright, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';

const supportItems = [
  { icon: Phone, label: 'Support Phone', value: '0774930316' },
  { icon: UserRound, label: 'Developer', value: 'Dimalka Balasooriya' }
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-950 px-6 py-7 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Help</p>
          <h2 className="mt-2 text-2xl font-semibold">Naveen Digital Studio Management System</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Contact and development information for the studio management system.
          </p>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-2">
          {supportItems.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <Icon size={19} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 font-semibold text-slate-950">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6">
        <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <ShieldCheck size={21} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-950">System Credits</h3>
              <p className="text-sm text-slate-500">Professional ownership and development details.</p>
            </div>
          </div>
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">Designed and developed by Dimalka Balasooriya.</p>
            <p className="mt-2">Owned by Naveen Digital Studio.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <p className="flex items-center gap-2"><Phone size={16} /> 0779736393</p>
              <p className="flex items-center gap-2"><Mail size={16} /> dntbalasooriya@gmail.com</p>
            </div>
          </div>
        </section>
      </div>

      <footer className="rounded-md border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Copyright size={16} />
            {new Date().getFullYear()} Naveen Digital Studio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
