const {
  raiseTicket,
  acceptTicket,
  assignTicket,
  closeTicket,
  escalateTicket,
  getTickets,
  fetchFilteredTickets,
  rejectTicket,
  getSingleUserTickets,
  filterMyTickets,
  filterTodayTickets,
  ticketData,
  getAllTickets,
  getOtherTickets,
  getAllDeptTickets,
  getTeamMemberTickets,
  updateOtherTicket,
} = require("../controllers/ticketsControllers/ticketsControllers");
const upload = require("../config/multerConfig");

const {
  supportTicket,
} = require("../controllers/ticketsControllers/supportTicketsController");
const {
  addTicketIssue,
  getTicketIssues,
  rejectTicketIssue,
  getNewTicketIssues,
} = require("../controllers/ticketsControllers/ticketIssueController");

const router = require("express").Router();

router.patch("/add-ticket-issue", addTicketIssue);
router.get("/ticket-issues/:department", getTicketIssues);
router.get("/new-ticket-issues/:department", getNewTicketIssues);
router.delete("/reject-ticket-issue/:id", rejectTicketIssue);
router.get("/get-tickets/:departmentId", getTickets);
router.get("/get-all-tickets", getAllTickets);
router.get("/get-depts-tickets", getAllDeptTickets);
router.get("/my-tickets", filterMyTickets);
router.get("/today", filterTodayTickets);
router.get("/:id", getSingleUserTickets);
router.post("/raise-ticket", upload.single("issue"), raiseTicket);
router.patch("/update-ticket/", updateOtherTicket);
router.patch("/accept-ticket/:ticketId", acceptTicket);
router.patch("/reject-ticket/:id", rejectTicket);
router.patch("/assign-ticket/:ticketId", assignTicket);
router.patch("/escalate-ticket", escalateTicket);
router.patch("/close-ticket", closeTicket);
router.post("/support-ticket", supportTicket);
router.get("/department-tickets/:departmentId", ticketData);
router.get("/team-members-tickets/", ticketData);
router.get("/ticket-filter/:flag/:dept", fetchFilteredTickets);
router.get("/other-tickets/:department", getOtherTickets);
router.get("/get-team-members/:departmentId", getTeamMemberTickets);

module.exports = router;
