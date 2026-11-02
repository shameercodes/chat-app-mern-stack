import React, { useContext } from "react";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import { ChatContext } from "../context/ChatContext";
import { sid } from "../lib/utils";

const HomePage = () => {
  const { selectedUser, selectedGroup } = useContext(ChatContext);
  const showRight = selectedUser || selectedGroup;

  return (
    <div className="w-full h-screen h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0b141a]">
      <div
        className={`h-full w-full grid relative overflow-hidden min-h-0 ${
          showRight
            ? "grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_360px]"
            : "grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)]"
        }`}
      >
        <Sidebar />
        <ChatContainer />
        {showRight && (
          <RightSidebar
            key={`${sid(selectedUser?._id || "")}-${sid(selectedGroup?._id || "")}`}
          />
        )}
      </div>
    </div>
  );
};

export default HomePage;
