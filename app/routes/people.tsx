import { Outlet } from "react-router";

export function meta() {
  return [{ title: "People · Tally" }];
}

export default function PeopleLayout() {
  return <Outlet />;
}
