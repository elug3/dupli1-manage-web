export function meta() {
  return [{ title: "Coupons | Schick Admin" }];
}

export default function Coupons() {
  return (
    <div className="rounded-2xl border border-[#E5E3EE] bg-white p-12 text-center shadow-[0_1px_4px_rgba(28,27,31,0.04)]">
      <h1 className="text-xl font-bold text-[#1C1B1F]">Coupons</h1>
      <p className="mt-2 text-sm text-[#6B6480]">
        No coupon endpoints are defined in the current API gateway. This section
        will be enabled when a coupons service is added.
      </p>
    </div>
  );
}
