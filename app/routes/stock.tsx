import { Outlet } from "react-router";

export function meta() {
  return [{ title: "Stock · Tally" }];
}

export default function StockLayout() {
  return <Outlet />;
}
